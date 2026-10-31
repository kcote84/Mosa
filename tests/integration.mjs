import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { adminContext } from '../scripts/admin-context.mjs';
const { db, auth, bucket } = adminContext(true);
const origin = 'http://127.0.0.1:5000';
async function login(uid) {
  const member = (await db.collection('members').doc(uid).get()).data();
  const token = await auth.createCustomToken(uid, { accessVersion: member.accessVersion || 0 });
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-mosa-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, returnSecureToken: true }) });
  const result = await response.json(); assert.ok(response.ok, 'Emulator sign-in failed'); return result.idToken;
}
async function call(path, token, method = 'GET', body) {
  const response = await fetch(`${origin}/api${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: response.headers.get('content-type')?.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}
test('parcours réels API, invitations, confidentialité et premier démarrage différé', { timeout: 180000 }, async t => {
  const admin = await login('admin-demo'), sender = await login('a2-member'), recipient = await login('a3-member'), otherBranch = await login('b2-member');
  const fixture = await sharp({ create: { width: 2200, height: 1400, channels: 3, background: '#e66a3c' } }).png().toBuffer();
  let photoId; const frameIds = [];
  try {
    await t.test('accès anonyme refusé, écriture directe Firebase refusée', async () => {
      assert.equal((await call('/photos')).status, 401);
      assert.equal((await call('/admin/overview', sender)).status, 403);
      const direct = await fetch('http://127.0.0.1:8080/v1/projects/demo-mosa/databases/(default)/documents/households');
      assert.equal(direct.status, 403);
    });
    await t.test('liste des destinataires filtrée par branche', async () => {
      const h = await call('/households', sender); assert.equal(h.status, 200);
      assert.deepEqual(h.data.map(x => x.id).sort(), ['home-a1', 'home-a2', 'home-a3', 'home-hub']);
      assert.equal((await call('/photos', sender, 'POST', { image: `data:image/png;base64,${fixture.toString('base64')}`, recipientIds: ['home-b2'] })).status, 403);
    });
    await t.test('envoi à des foyers sans cadre connecté, optimisation et suppression des métadonnées', async () => {
      const result = await call('/photos', sender, 'POST', { image: `data:image/png;base64,${fixture.toString('base64')}`, recipientIds: ['home-a1', 'home-a3'], caption: 'TEST automatique — arrivée différée', fit: 'contain' });
      assert.equal(result.status, 201, JSON.stringify(result.data)); photoId = result.data.id;
      const photo = await call(`/photos/${photoId}/image`, sender); assert.equal(photo.status, 200);
      const metadata = await sharp(photo.data).metadata(); assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.width, 1920); assert.equal(metadata.exif, undefined);
    });
    await t.test('Un foyer reçoit; l’autre branche et l’admin exclus ne voient ni liste ni image', async () => {
      assert.ok((await call('/photos', recipient)).data.photos.some(p => p.id === photoId));
      for (const token of [otherBranch, admin]) { assert.ok(!(await call('/photos', token)).data.photos.some(p => p.id === photoId)); assert.equal((await call(`/photos/${photoId}/image`, token)).status, 404); }
      assert.ok((await call('/photos?scope=admin', admin)).data.photos.some(p => p.id === photoId));
      assert.equal((await call(`/photos/${photoId}/image?moderation=1`, admin)).status, 200);
      assert.equal((await call(`/photos/${photoId}/image?moderation=1`, otherBranch)).status, 404);
    });
    let frameToken;
    await t.test('cadre créé APRÈS l’envoi reçoit la photo dès sa première connexion', async () => {
      const created = await call('/admin/frames', admin, 'POST', { householdId: 'home-a1', label: 'TEST première connexion' });
      assert.equal(created.status, 201); frameIds.push(created.data.id);
      const enrollment = await call(`/admin/frames/${created.data.id}/enrollment`, admin, 'POST'); assert.equal(enrollment.status, 200);
      const enrolled = await call('/frame/enroll', null, 'POST', { token: enrollment.data.token }); assert.equal(enrolled.status, 200); frameToken = enrolled.data.token;
      const manifest = await call('/frame/manifest', frameToken); assert.equal(manifest.status, 200); assert.ok(manifest.data.photos.some(p => p.id === photoId));
      assert.equal((await call(`/frame/photos/${photoId}`, frameToken)).status, 200);
      const unchanged = await call(`/frame/manifest?version=${manifest.data.version}`, frameToken); assert.equal(unchanged.data.unchanged, true); assert.equal(unchanged.data.photos, undefined);
      assert.equal((await call('/frame/enroll', null, 'POST', { token: enrollment.data.token })).status, 401);
    });
    await t.test('masquage local sans supprimer chez les autres destinataires', async () => {
      assert.equal((await call(`/photos/${photoId}/hide`, recipient, 'POST')).status, 200);
      assert.equal((await call(`/photos/${photoId}/image`, recipient)).status, 404);
      assert.equal((await call(`/frame/photos/${photoId}`, frameToken)).status, 200);
      assert.equal((await call(`/photos/${photoId}`, recipient, 'DELETE')).status, 404);
    });
    await t.test('liens concurrents : seul le dernier reste valide, usage unique', async () => {
      const links = await Promise.all([0, 1].map(() => call('/admin/invitations', admin, 'POST', { memberId: 'a1-second' })));
      assert.equal(links[0].status, 201); assert.equal(links[1].status, 201);
      const result = await Promise.all(links.map(l => call('/auth/redeem', null, 'POST', { token: l.data.token })));
      assert.deepEqual(result.map(r => r.status).sort(), [200, 401]);
      const used = result.findIndex(r => r.status === 200); assert.equal((await call('/auth/redeem', null, 'POST', { token: links[used].data.token })).status, 401);
    });
    await t.test('révocation immédiate du téléphone et des invitations anciennes', async () => {
      const invitation = await call('/admin/invitations', admin, 'POST', { memberId: 'a3-member' }); assert.equal(invitation.status, 201);
      assert.equal((await call('/admin/members/a3-member/revoke', admin, 'POST')).status, 200);
      assert.ok([401,403].includes((await call('/me', recipient)).status));
      assert.equal((await call('/auth/redeem', null, 'POST', { token: invitation.data.token })).status, 401);
    });
    await t.test('enrôlements concurrents : un seul permet de préparer le cadre', async () => {
      const links = await Promise.all([0, 1].map(() => call(`/admin/frames/${frameIds[0]}/enrollment`, admin, 'POST')));
      const results = await Promise.all(links.map(l => call('/frame/enroll', null, 'POST', { token: l.data.token })));
      assert.deepEqual(results.map(r => r.status).sort(), [200,401]);
      assert.equal((await call('/frame/manifest', frameToken)).status, 401);
      frameToken = results.find(r => r.status === 200).data.token;
    });
    await t.test('suppression globale : manifest et accès image retirés', async () => {
      assert.equal((await call(`/photos/${photoId}`, sender, 'DELETE')).status, 200);
      const manifest = await call('/frame/manifest', frameToken); assert.ok(!manifest.data.photos.some(p => p.id === photoId));
      assert.equal((await call(`/frame/photos/${photoId}`, frameToken)).status, 404);
      assert.equal((await call(`/photos/${photoId}/image`, sender)).status, 404);
    });
  } finally {
    if (photoId) { const p = (await db.collection('photos').doc(photoId).get()).data(); if (p) { await Promise.allSettled([bucket.file(p.storagePath).delete({ ignoreNotFound: true }), bucket.file(p.thumbPath).delete({ ignoreNotFound: true })]); await db.collection('photos').doc(photoId).delete(); } }
    for (const id of frameIds) await db.collection('frames').doc(id).delete();
  }
});
