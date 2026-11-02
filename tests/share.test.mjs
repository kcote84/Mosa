import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { sharedIntent } from '../web/src/share.js';

const origin = 'https://mosa.test';
const worker = fs.readFileSync(new URL('../web/public/share-inbox-worker.js', import.meta.url), 'utf8');
const picture = (name = 'photo.jpg', type = 'image/jpeg') => new File(['image test'], name, { type });
function setup() {
  let now = Date.now();
  const listeners = new Map();
  const context = { Blob, crypto, URL, URLSearchParams, Response, indexedDB: new IDBFactory(),
    Date: class extends Date { static now() { return now; } },
    location: { origin }, clients: { get: async id => ({ url: id === 'foreign' ? 'https://other.test/' : origin + '/' }) },
    addEventListener: (name, listener) => listeners.set(name, listener) };
  context.self = context;
  vm.runInNewContext(worker, context);
  async function receive(files, headers = {}) {
    // Files are supplied exactly as request.formData().getAll('photos') supplies them.
    const response = await context.MosaShareInbox.receive({ headers: new Headers(headers), formData: async () => ({ getAll: () => files }) });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    return new URL(response.headers.get('Location'), origin).searchParams;
  }
  async function message(type, id, source = 'app') {
    let result, promise;
    listeners.get('message')({ data: { type, id }, source: { id: source }, ports: [{ postMessage: value => { result = value; } }], waitUntil: value => { promise = value; } });
    await promise;
    return result;
  }
  return { receive, message, context, advance: ms => { now += ms; } };
}

test('partage multipart réel : plusieurs fichiers attendent la connexion, puis sont effacés après import', async () => {
  const app = setup();
  const data = new FormData(); data.append('photos', picture()); data.append('photos', picture('second.png', 'image/png'));
  const request = new Request(origin + '/share-target', { method: 'POST', body: data });
  const response = await app.context.MosaShareInbox.receive(request);
  const id = new URL(response.headers.get('Location'), origin).searchParams.get('share');
  const first = await app.message('MOSA_SHARE_GET', id);
  assert.equal(first.files.length, 2);
  assert.equal(await first.files[0].text(), 'image test');
  assert.equal((await app.message('MOSA_SHARE_GET', id)).files.length, 2, 'lecture seule : une reprise après connexion reste possible');
  await app.message('MOSA_SHARE_REMOVE', id);
  assert.equal((await app.message('MOSA_SHARE_GET', id)).error, 'share_expired');
});

test('50 photos acceptées; 51 refusées sans perte silencieuse', async () => {
  const app = setup();
  const accepted = await app.receive(Array.from({ length: 50 }, () => picture()));
  assert.equal((await app.message('MOSA_SHARE_GET', accepted.get('share'))).files.length, 50);
  assert.equal((await app.receive(Array.from({ length: 51 }, () => picture()))).get('share-error'), 'share_too_many');
});

test('liens seuls, fichiers vides, SVG et faux types refusés; JPEG sans MIME accepté', async () => {
  const app = setup();
  assert.equal((await app.receive([])).get('share-error'), 'share_empty');
  for (const value of ['https://photos.example/test', picture('photo.svg', 'image/svg+xml'), picture('fake.jpg', 'text/html'), new File([], 'empty.jpg', { type: 'image/jpeg' })]) {
    assert.equal((await app.receive([value])).get('share-error'), 'unsupported_image');
  }
  assert.ok((await app.receive([picture('photo.JPG', '')])).get('share'));
});

test('limites de taille par photo et par lot contrôlées avant stockage', async () => {
  const app = setup();
  const large = picture(); Object.defineProperty(large, 'size', { value: 41 * 1024 * 1024 });
  assert.equal((await app.receive([large])).get('share-error'), 'image_too_large');
  const many = Array.from({ length: 8 }, () => { const file = picture(); Object.defineProperty(file, 'size', { value: 32 * 1024 * 1024 }); return file; });
  assert.equal((await app.receive(many)).get('share-error'), 'share_too_large');
  assert.equal((await app.receive([], { 'Content-Length': 300 * 1024 * 1024 })).get('share-error'), 'share_too_large');
});

test('lots simultanés isolés et boîte limitée sans écraser les partages précédents', async () => {
  const app = setup();
  const results = await Promise.all(Array.from({ length: 4 }, () => app.receive([picture()])));
  const ids = results.map(result => result.get('share')).filter(Boolean);
  assert.equal(new Set(ids).size, 3);
  assert.equal(results.filter(result => result.get('share-error') === 'share_storage_full').length, 1);
  await app.message('MOSA_SHARE_REMOVE', ids[0]);
  assert.equal((await app.message('MOSA_SHARE_GET', ids[1])).files.length, 1);
  assert.ok((await app.receive([picture()])).get('share'));
});

test('expiration après une heure et déconnexion purgent les fichiers en attente', async () => {
  const app = setup();
  const first = (await app.receive([picture()])).get('share');
  app.advance(60 * 60 * 1000 + 1);
  assert.equal((await app.message('MOSA_SHARE_GET', first)).error, 'share_expired');
  const second = (await app.receive([picture()])).get('share');
  await app.message('MOSA_SHARE_CLEAR');
  assert.equal((await app.message('MOSA_SHARE_GET', second)).error, 'share_expired');
});

test('la boîte locale refuse une autre origine et les identifiants arbitraires', async () => {
  const app = setup();
  assert.equal((await app.receive([picture()], { Origin: 'https://other.test' })).get('share-error'), 'share_empty');
  const id = (await app.receive([picture()])).get('share');
  assert.equal(await app.message('MOSA_SHARE_GET', id, 'foreign'), undefined);
  assert.equal((await app.message('MOSA_SHARE_GET', '../other')).error, 'share_expired');
});

test('navigation vers le brouillon partagé sans accepter une erreur arbitraire', () => {
  const id = crypto.randomUUID();
  assert.deepEqual(sharedIntent(origin + '/?share=' + id), { id });
  assert.deepEqual(sharedIntent(origin + '/?share=invalid'), { error: 'share_expired' });
  assert.deepEqual(sharedIntent(origin + '/?share-error=share_too_many'), { error: 'share_too_many' });
  assert.deepEqual(sharedIntent(origin + '/?share-error=arbitrary'), { error: 'share_empty' });
  assert.equal(sharedIntent(origin + '/'), null);
});

test('le POST de partage est intercepté localement, les autres POST restent au serveur', async () => {
  const app = setup(), handlers = new Map();
  Object.assign(app.context, { importScripts: () => {}, addEventListener: (name, callback) => handlers.set(name, callback) });
  vm.runInNewContext(fs.readFileSync(new URL('../web/public/sw.js', import.meta.url), 'utf8'), app.context);
  const form = new FormData(); form.append('photos', picture());
  let response;
  handlers.get('fetch')({ request: new Request(origin + '/share-target', { method: 'POST', body: form }), respondWith: value => { response = value; } });
  assert.equal((await response).status, 303);
  let intercepted = false;
  handlers.get('fetch')({ request: new Request(origin + '/api/photos', { method: 'POST' }), respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
});
