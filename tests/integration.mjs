import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminContext } from '../scripts/admin-context.mjs';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, collection, setDoc, onSnapshot, terminate } from 'firebase/firestore';
const { db, auth, bucket } = adminContext(true);
after(async () => { await db.terminate(); });
const origin = 'http://127.0.0.1:5000';
async function signalClient(frameToken, name) {
  const session = await call('/frame/realtime-session', frameToken, 'POST');
  assert.equal(session.status, 200);
  const app = initializeApp({ projectId: 'demo-mosa', apiKey: 'demo-mosa-key', appId: '1:123:android:demo' }, name);
  const clientAuth = getAuth(app); connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const clientDb = getFirestore(app); connectFirestoreEmulator(clientDb, '127.0.0.1', 8080);
  await signInWithCustomToken(clientAuth, session.data.customToken);
  return { app, db: clientDb };
}
async function signalAfter(client, householdId, action) {
  let unsubscribe;
  let timer;
  let actionDone;
  try {
    const revision = await new Promise((resolve, reject) => {
      let initial;
      timer = setTimeout(() => reject(new Error('Signal temps réel non reçu')), 15000);
      unsubscribe = onSnapshot(doc(client.db, 'albumSignals', householdId), { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.fromCache) return;
        const revision = snapshot.data()?.revision || 0;
        if (initial === undefined) { initial = revision; actionDone = Promise.resolve().then(action); actionDone.catch(reject); }
        else if (revision > initial) resolve(revision);
      }, reject);
    });
    await actionDone;
    return revision;
  } finally { clearTimeout(timer); unsubscribe?.(); }
}
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
  let photoId; const extraPhotoIds = []; const frameIds = []; const signalClients = []; let signalA1, signalA3;
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
    await t.test('signal privé : seulement le foyer du cadre, aucun accès aux photos/comptes/écritures', async () => {
      assert.equal((await call('/frame/realtime-session', null, 'POST')).status, 401);
      assert.equal((await call('/frame/realtime-session', sender, 'POST')).status, 401);
      signalA1 = await signalClient(frameToken, 'frame-a1'); signalClients.push(signalA1);
      assert.ok((await getDoc(doc(signalA1.db, 'albumSignals', 'home-a1'))).exists());
      for (const path of ['albumSignals/home-a3', 'albumSignals/home-b2', `photos/${photoId}`, `frames/${frameIds[0]}`, 'households/home-a1', 'members/admin-demo']) {
        await assert.rejects(getDoc(doc(signalA1.db, path)), e => e.code === 'permission-denied');
      }
      await assert.rejects(getDocs(collection(signalA1.db, 'albumSignals')), e => e.code === 'permission-denied');
      await assert.rejects(setDoc(doc(signalA1.db, 'albumSignals', 'home-a1'), { revision: 123 }), e => e.code === 'permission-denied');
      const created = await call('/admin/frames', admin, 'POST', { householdId: 'home-a3', label: 'TEST signal privé' });
      assert.equal(created.status, 201); frameIds.push(created.data.id);
      const enrollment = await call(`/admin/frames/${created.data.id}/enrollment`, admin, 'POST');
      const enrolled = await call('/frame/enroll', null, 'POST', { token: enrollment.data.token });
      signalA3 = await signalClient(enrolled.data.token, 'frame-a3'); signalClients.push(signalA3);
    });
    await t.test('mise à jour urgente : admin seulement, demande persistante, signal et accusé du cadre', async () => {
      assert.equal((await call('/admin/frame-updates', sender, 'POST', { frameIds: [frameIds[0]] })).status, 403);
      assert.equal((await call('/admin/frame-updates', null, 'POST', { frameIds: [frameIds[0]] })).status, 401);
      assert.equal((await call('/admin/frame-updates', admin, 'POST', { frameIds: [] })).status, 400);
      assert.equal((await call('/admin/frame-updates', admin, 'POST', { frameIds: [frameIds[0]] })).status, 409);
      assert.equal((await call('/frame/heartbeat', frameToken, 'POST', { appVersion: '0.4.1', appVersionCode: 14, remoteUpdates: true, managed: true, cachedPhotos: 1 })).status, 200);
      const before = await call('/frame/manifest', frameToken);
      let pushed;
      await signalAfter(signalA1, 'home-a1', async () => {
        pushed = await call('/admin/frame-updates', admin, 'POST', { frameIds: [frameIds[0]], url: 'https://not-mosa.invalid/test.apk', targetVersion: 99999 });
        assert.equal(pushed.status, 202);
      });
      const queued = await call(`/frame/manifest?version=${before.data.version}`, frameToken);
      assert.notEqual(queued.data.unchanged, true);
      assert.equal(queued.data.updateRequest.id, pushed.data.command.id);
      assert.notEqual(queued.data.updateRequest.targetVersion, 99999);
      assert.equal(queued.data.updateRequest.url, undefined);
      const ref = db.collection('frames').doc(frameIds[0]);
      // Simulate the next published version to test progress without installing Android in this test.
      await ref.update({ 'remoteUpdate.targetVersion': 15 });
      await call('/frame/heartbeat', frameToken, 'POST', { appVersionCode: 14, remoteUpdates: true, managed: true, updateRequestId: 'an-old-request', updateState: 'error' });
      assert.equal((await ref.get()).data().remoteUpdate.state, 'queued');
      await call('/frame/heartbeat', frameToken, 'POST', { appVersionCode: 14, remoteUpdates: true, managed: true, updateRequestId: pushed.data.command.id, updateState: 'checking' });
      assert.equal((await ref.get()).data().remoteUpdate.state, 'checking');
      await call('/frame/heartbeat', frameToken, 'POST', { appVersionCode: 15, remoteUpdates: true, managed: true, updateRequestId: pushed.data.command.id, updateState: 'up_to_date' });
      assert.equal((await ref.get()).data().remoteUpdate.state, 'installed');
    });
    await t.test('admin : photos par cadre et retrait ciblé sans effacer les autres foyers', async () => {
      const uploaded = await call('/photos', sender, 'POST', { image: `data:image/png;base64,${fixture.toString('base64')}`, recipientIds: ['home-a1', 'home-a3'], caption: 'TEST retrait admin ciblé' });
      assert.equal(uploaded.status, 201); const id = uploaded.data.id; extraPhotoIds.push(id);
      const pending = await call('/admin/frames', admin, 'POST', { householdId: 'home-a1', label: 'TEST cadre en attente' });
      assert.equal(pending.status, 201); frameIds.push(pending.data.id);
      const list = frameId => call(`/photos?scope=admin&frameId=${frameId}`, admin);
      const removePath = `/admin/frames/${frameIds[0]}/photos/${id}/hide`;
      assert.equal((await call(`/photos?scope=admin&frameId=${frameIds[0]}`, sender)).status, 403);
      assert.equal((await call(`/photos?scope=album&frameId=${frameIds[0]}`, sender)).status, 403);
      assert.equal((await call(removePath, sender, 'POST')).status, 403);
      assert.equal((await call(removePath, null, 'POST')).status, 401);
      assert.equal((await list('unknown-frame')).status, 404);
      assert.ok((await list(pending.data.id)).data.photos.some(p => p.id === id));
      assert.equal((await list('frame-demo')).data.total, 0);
      assert.equal((await call(`/admin/frames/frame-demo/photos/${id}/hide`, admin, 'POST')).status, 404);
      const otherSignal = (await db.collection('albumSignals').doc('home-a3').get()).data().revision;
      await signalAfter(signalA1, 'home-a1', async () => {
        // The server derives the household from the frame, never from submitted fields.
        assert.equal((await call(removePath, admin, 'POST', { householdId: 'home-a3' })).status, 200);
      });
      assert.equal((await db.collection('albumSignals').doc('home-a3').get()).data().revision, otherSignal);
      for (const frameId of [frameIds[0], pending.data.id]) assert.ok(!(await list(frameId)).data.photos.some(p => p.id === id));
      assert.ok((await list(frameIds[1])).data.photos.some(p => p.id === id));
      assert.ok(!(await call('/frame/manifest', frameToken)).data.photos.some(p => p.id === id));
      assert.equal((await call(`/frame/photos/${id}`, frameToken)).status, 404);
      assert.equal((await call(`/photos/${id}/image`, recipient)).status, 200);
      assert.equal((await call(removePath, admin, 'POST')).status, 404);
      const saved = (await db.collection('photos').doc(id).get()).data();
      assert.equal(saved.deleted, false); assert.deepEqual(saved.visibleTo, ['home-a3']);
      assert.equal((await call(`/photos/${id}`, admin, 'DELETE')).status, 200);
      assert.ok(!(await list(frameIds[1])).data.photos.some(p => p.id === id));
      assert.equal((await call(`/photos/${id}/image`, recipient)).status, 404);
    });
    await t.test('admin : retrait avant association du cadre, futur téléchargement exclu et autres foyers préservés', async () => {
      assert.equal((await db.collection('frames').where('householdId', '==', 'home-a2').get()).empty, true);
      const uploaded = await call('/photos', sender, 'POST', { image: `data:image/png;base64,${fixture.toString('base64')}`, recipientIds: ['home-a2', 'home-a3'], caption: 'TEST retrait avant association' });
      assert.equal(uploaded.status, 201); const id = uploaded.data.id; extraPhotoIds.push(id);
      const listPath = '/photos?scope=admin&householdId=home-a2';
      const removePath = `/admin/households/home-a2/photos/${id}/hide`;
      assert.ok((await call(listPath, admin)).data.photos.some(p => p.id === id));
      assert.equal((await call(listPath, sender)).status, 403);
      assert.equal((await call('/photos?scope=album&householdId=home-a3', sender)).status, 403);
      assert.equal((await call(listPath)).status, 401);
      assert.equal((await call('/photos?scope=admin&householdId=unknown-home', admin)).status, 404);
      assert.equal((await call(`${listPath}&frameId=${frameIds[0]}`, admin)).status, 400);
      assert.equal((await call(removePath, sender, 'POST')).status, 403);
      assert.equal((await call(removePath, null, 'POST')).status, 401);
      assert.equal((await call(`/admin/households/unknown-home/photos/${id}/hide`, admin, 'POST')).status, 404);
      assert.equal((await call(`/admin/households/home-b2/photos/${id}/hide`, admin, 'POST')).status, 404);
      const targetRevision = (await db.collection('albumSignals').doc('home-a2').get()).data().revision;
      const otherRevision = (await db.collection('albumSignals').doc('home-a3').get()).data().revision;
      // Extra request fields cannot redirect the removal to a different household.
      assert.equal((await call(removePath, admin, 'POST', { householdId: 'home-a3' })).status, 200);
      assert.ok(!(await call(listPath, admin)).data.photos.some(p => p.id === id));
      assert.ok(!(await call('/photos', sender)).data.photos.some(p => p.id === id));
      assert.ok((await call('/photos', recipient)).data.photos.some(p => p.id === id));
      assert.equal((await call(`/photos/${id}/image`, recipient)).status, 200);
      const saved = (await db.collection('photos').doc(id).get()).data();
      assert.equal(saved.deleted, false); assert.deepEqual(saved.visibleTo, ['home-a3']);
      assert.equal((await db.collection('albumSignals').doc('home-a2').get()).data().revision, targetRevision + 1);
      assert.equal((await db.collection('albumSignals').doc('home-a3').get()).data().revision, otherRevision);
      assert.equal((await call(removePath, admin, 'POST')).status, 404);
      const created = await call('/admin/frames', admin, 'POST', { householdId: 'home-a2', label: 'TEST cadre créé après retrait' });
      assert.equal(created.status, 201); frameIds.push(created.data.id);
      const enrollment = await call(`/admin/frames/${created.data.id}/enrollment`, admin, 'POST');
      assert.equal(enrollment.status, 200);
      const enrolled = await call('/frame/enroll', null, 'POST', { token: enrollment.data.token });
      assert.equal(enrolled.status, 200);
      const manifest = await call('/frame/manifest', enrolled.data.token);
      assert.equal(manifest.status, 200); assert.ok(!manifest.data.photos.some(p => p.id === id));
      assert.equal((await call(`/frame/photos/${id}`, enrolled.data.token)).status, 404);
    });
    await t.test('admin : retrait groupé atomique, sélection limitée et nouvelle tentative sans double signal', async () => {
      const selectedIds = [];
      for (let i = 0; i < 4; i++) {
        const uploaded = await call('/photos', sender, 'POST', { image: `data:image/png;base64,${fixture.toString('base64')}`, recipientIds: i === 3 ? ['home-a3'] : ['home-a1', 'home-a3'], caption: `TEST retrait groupé ${i}` });
        assert.equal(uploaded.status, 201); selectedIds.push(uploaded.data.id); extraPhotoIds.push(uploaded.data.id);
      }
      const path = '/admin/households/home-a1/photos/hide';
      const body = { photoIds: selectedIds.slice(0, 2) };
      assert.equal((await call(path, sender, 'POST', body)).status, 403);
      assert.equal((await call(path, null, 'POST', body)).status, 401);
      assert.equal((await call('/admin/households/unknown-home/photos/hide', admin, 'POST', body)).status, 404);
      for (const photoIds of [[], 'not-an-array', ['invalid/id'], Array(201).fill(selectedIds[0])]) {
        assert.equal((await call(path, admin, 'POST', { photoIds })).status, 400);
      }
      for (const invalid of ['unknown-photo', selectedIds[3]]) {
        assert.equal((await call(path, admin, 'POST', { photoIds: [selectedIds[0], invalid] })).status, 409);
        assert.ok((await db.collection('photos').doc(selectedIds[0]).get()).data().visibleTo.includes('home-a1'));
      }
      const before = (await db.collection('albumSignals').doc('home-a1').get()).data().revision;
      const otherBefore = (await db.collection('albumSignals').doc('home-a3').get()).data().revision;
      await signalAfter(signalA1, 'home-a1', async () => {
        const results = await Promise.all([0, 1].map(() => call(path, admin, 'POST', { photoIds: [...body.photoIds, body.photoIds[0]], householdId: 'home-a3' })));
        assert.ok(results.every(r => r.status === 200));
        assert.deepEqual(results.map(r => r.data.removed).sort(), [0, 2]);
      });
      assert.equal((await db.collection('albumSignals').doc('home-a1').get()).data().revision, before + 1);
      assert.equal((await db.collection('albumSignals').doc('home-a3').get()).data().revision, otherBefore);
      const manifest = await call('/frame/manifest', frameToken);
      for (const id of body.photoIds) {
        const photo = (await db.collection('photos').doc(id).get()).data();
        assert.equal(photo.deleted, false); assert.deepEqual(photo.visibleTo, ['home-a3']);
        assert.ok(!manifest.data.photos.some(p => p.id === id));
        assert.equal((await call(`/frame/photos/${id}`, frameToken)).status, 404);
        assert.equal((await call(`/photos/${id}/image`, recipient)).status, 200);
      }
      assert.ok(manifest.data.photos.some(p => p.id === selectedIds[2]));
    });
    await t.test('masquage local immédiatement signalé au seul foyer concerné', async () => {
      const before = (await db.collection('albumSignals').doc('home-a1').get()).data().revision;
      await signalAfter(signalA3, 'home-a3', async () => {
        assert.equal((await call(`/photos/${photoId}/hide`, recipient, 'POST')).status, 200);
      });
      assert.equal((await db.collection('albumSignals').doc('home-a1').get()).data().revision, before);
      assert.equal((await call(`/photos/${photoId}/image`, recipient)).status, 404);
      assert.equal((await call(`/frame/photos/${photoId}`, frameToken)).status, 200);
      assert.equal((await call(`/photos/${photoId}`, recipient, 'DELETE')).status, 404);
    });
    await t.test('liens concurrents : seul le dernier reste valide, usage unique', async () => {
      const links = await Promise.all([0, 1].map(() => call('/admin/invitations', admin, 'POST', { memberId: 'a1-second' })));
      assert.equal(links[0].status, 201); assert.equal(links[1].status, 201);
      const result = await Promise.all(links.map(l => call('/auth/redeem', null, 'POST', { token: l.data.token })));
      assert.deepEqual(result.map(r => r.status).sort(), [200, 401]);
      const used = result.findIndex(r => r.status === 200);
      assert.equal(result.find(r => r.status === 401).data.error, 'replaced_invitation');
      const repeated = await call('/auth/redeem', null, 'POST', { token: links[used].data.token });
      assert.equal(repeated.status, 401); assert.equal(repeated.data.error, 'used_invitation');
    });
    await t.test('un lien réellement expiré est distingué d’un lien déjà utilisé', async () => {
      const link = await call('/admin/invitations', admin, 'POST', { memberId: 'a3-member' });
      assert.equal(link.status, 201);
      const hash = createHash('sha256').update(link.data.token).digest('hex');
      await db.collection('invitations').doc(hash).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
      const expired = await call('/auth/redeem', null, 'POST', { token: link.data.token });
      assert.equal(expired.status, 401); assert.equal(expired.data.error, 'expired_invitation');
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
      await assert.rejects(getDoc(doc(signalA1.db, 'albumSignals', 'home-a1')), e => e.code === 'permission-denied');
      signalA1 = await signalClient(frameToken, 'frame-a1-renewed'); signalClients.push(signalA1);
    });
    await t.test('suppression globale : manifest et accès image retirés', async () => {
      await signalAfter(signalA1, 'home-a1', async () => {
        assert.equal((await call(`/photos/${photoId}`, sender, 'DELETE')).status, 200);
      });
      const manifest = await call('/frame/manifest', frameToken); assert.ok(!manifest.data.photos.some(p => p.id === photoId));
      assert.equal((await call(`/frame/photos/${photoId}`, frameToken)).status, 404);
      assert.equal((await call(`/photos/${photoId}/image`, sender)).status, 404);
    });
    await t.test('trois familles : permissions des foyers mixtes et confidentialité sans accès indirect', async () => {
      const third = await login('c1-member'), thirdSecond = await login('c1-second');
      const mixed = await login('b2-member'), mixedSecond = await login('b2-second');
      const hubMember = await login('hub-member'), coteOnly = await login('b1-member');
      const destinations = async token => (await call('/households', token)).data.map(h => h.id).sort();
      for (const token of [third, thirdSecond]) assert.deepEqual(await destinations(token), ['home-b2', 'home-c1', 'home-hub']);
      for (const token of [mixed, mixedSecond]) assert.deepEqual(await destinations(token), ['home-b1', 'home-b2', 'home-b3', 'home-c1', 'home-hub']);
      assert.deepEqual(await destinations(coteOnly), ['home-b1', 'home-b2', 'home-b3', 'home-hub']);
      assert.deepEqual(await destinations(sender), ['home-a1', 'home-a2', 'home-a3', 'home-hub']);
      for (const token of [admin, hubMember]) assert.equal((await destinations(token)).length, 8);
      const image = `data:image/png;base64,${fixture.toString('base64')}`;
      for (const recipientIds of [['home-a1'], ['home-b1']]) assert.equal((await call('/photos', third, 'POST', { image, recipientIds })).status, 403);
      assert.equal((await call('/photos', coteOnly, 'POST', { image, recipientIds: ['home-c1'] })).status, 403);
      for (const token of [third, mixed, mixedSecond, hubMember]) assert.equal((await call('/admin/overview', token)).status, 403);
      const uploaded = await call('/photos', third, 'POST', { image, recipientIds: ['home-c1', 'home-b2'], caption: 'TEST troisième famille' });
      assert.equal(uploaded.status, 201); extraPhotoIds.push(uploaded.data.id);
      for (const token of [thirdSecond, mixed, mixedSecond]) assert.equal((await call(`/photos/${uploaded.data.id}/image`, token)).status, 200);
      for (const token of [sender, coteOnly, hubMember]) {
        assert.ok(!(await call('/photos', token)).data.photos.some(p => p.id === uploaded.data.id));
        assert.equal((await call(`/photos/${uploaded.data.id}/image`, token)).status, 404);
      }
      const changed = await call('/admin/households/home-c1', admin, 'PATCH', { branches: ['castonguay'] });
      assert.equal(changed.status, 200); assert.deepEqual(changed.data.branches, ['castonguay']);
      assert.equal((await call('/admin/households/home-c1', third, 'PATCH', { branches: ['viel'] })).status, 403);
    });
    await t.test('désactivation du cadre et du foyer coupe aussi le signal', async () => {
      const ref = db.collection('frames').doc(frameIds[0]);
      await ref.update({ active: false });
      await assert.rejects(getDoc(doc(signalA1.db, 'albumSignals', 'home-a1')), e => e.code === 'permission-denied');
      assert.equal((await call('/frame/realtime-session', frameToken, 'POST')).status, 401);
      await ref.update({ active: true });
      const household = db.collection('households').doc('home-a1');
      try {
        await household.update({ active: false });
        await assert.rejects(getDoc(doc(signalA1.db, 'albumSignals', 'home-a1')), e => e.code === 'permission-denied');
      } finally { await household.update({ active: true }); }
    });
  } finally {
    for (const client of signalClients) { await terminate(client.db); await deleteApp(client.app); }
    for (const id of [photoId, ...extraPhotoIds].filter(Boolean)) { const p = (await db.collection('photos').doc(id).get()).data(); if (p) { await Promise.allSettled([bucket.file(p.storagePath).delete({ ignoreNotFound: true }), bucket.file(p.thumbPath).delete({ ignoreNotFound: true })]); await db.collection('photos').doc(id).delete(); } }
    for (const id of frameIds) { await db.collection('frames').doc(id).delete(); await auth.deleteUser(`frame_${id}`).catch(() => {}); }
  }
});
