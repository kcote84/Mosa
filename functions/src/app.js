import express from 'express';
import { randomBytes, createHash } from 'node:crypto';
import sharp from 'sharp';
import { FieldValue, FieldPath, Timestamp } from 'firebase-admin/firestore';
import { db, auth, bucket, local, projectId } from './firebase.js';
import { canSendTo, isRecipient, canReadPhoto, canDeletePhoto, cleanName, cleanBranches, normalizeSettings, DEFAULT_SETTINGS } from './policy.js';

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));
app.use((req, res, next) => {
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  next();
});
const api = express.Router();
app.use('/api', api);
const hash = value => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const row = doc => doc.exists ? { id: doc.id, ...doc.data() } : null;
const rows = snap => snap.docs.map(row);
const now = () => Date.now();
const fail = (code, status = 400) => Object.assign(new Error(code), { status, code });
const text = (v, max = 500) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const get = async (collection, id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id) ? row(await db.collection(collection).doc(id).get()) : null;
const publicFrame = f => { const { tokenHash, activeEnrollmentHash, ...safe } = f; return safe; };
const wrap = fn => async (req, res, next) => { try { await fn(req, res, next); } catch (e) { next(e); } };
const bearer = req => /^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.get('authorization') || '')?.[1];
// The signal contains no photos or personal data. It commits with the album change.
function albumChanged(batch, householdId) {
  batch.update(db.collection('households').doc(householdId), { photoRevision: FieldValue.increment(1) });
  batch.set(db.collection('albumSignals').doc(householdId), { revision: FieldValue.increment(1) }, { merge: true });
}

async function throttle(req, operation, maximum = 40) {
  const window = Math.floor(now() / (15 * 60 * 1000));
  const ip = req.get('x-forwarded-for')?.split(',')[0].trim() || req.ip || 'unknown';
  const ref = db.collection('rateLimits').doc(hash(`${operation}:${ip}:${window}`));
  await db.runTransaction(async tx => {
    const old = await tx.get(ref);
    if ((old.data()?.count || 0) >= maximum) throw fail('too_many_attempts', 429);
    tx.set(ref, { count: (old.data()?.count || 0) + 1, expiresAt: Timestamp.fromMillis(now() + 24 * 3600000) });
  });
}
const memberAuth = wrap(async (req, res, next) => {
  const token = bearer(req); if (!token) throw fail('sign_in_required', 401);
  let decoded; try { decoded = await auth.verifyIdToken(token, true); } catch { throw fail('sign_in_required', 401); }
  const member = await get('members', decoded.uid);
  const household = member && await get('households', member.householdId);
  if (!member?.active || !household?.active) throw fail('access_revoked', 403);
  if ((decoded.accessVersion || 0) !== (member.accessVersion || 0)) throw fail('access_revoked', 403);
  req.member = member; req.household = household; next();
});
const adminAuth = (req, res, next) => req.member?.role === 'admin' ? next() : next(fail('admin_required', 403));
const frameAuth = wrap(async (req, res, next) => {
  const token = bearer(req); if (!token || token.length < 32) throw fail('frame_access_revoked', 401);
  const matches = await db.collection('frames').where('tokenHash', '==', hash(token)).limit(1).get();
  const frame = matches.empty ? null : row(matches.docs[0]);
  const household = frame && await get('households', frame.householdId);
  if (!frame?.active || !household?.active) throw fail('frame_access_revoked', 401);
  req.frame = frame; req.household = household; next();
});
async function authorizePhoto(req, frame = false) {
  const photo = await get('photos', req.params.id);
  if (!photo || !(frame ? isRecipient(photo, req.frame.householdId) : canReadPhoto(req.member, photo, { moderation: req.query.moderation === '1' }))) throw fail('photo_not_found', 404);
  return photo;
}
async function sendImage(req, res, frame = false) {
  const photo = await authorizePhoto(req, frame);
  const path = req.query.size === 'thumb' ? photo.thumbPath : photo.storagePath;
  const [data] = await bucket.file(path).download();
  res.type('jpeg').send(data);
}

api.get('/health', (req, res) => res.json({ ok: true, app: 'Mosa', version: '0.1.0' }));
api.get('/config', (req, res) => res.json({
  local, firebase: { projectId, apiKey: process.env.MOSA_FIREBASE_API_KEY || (local ? 'demo-mosa-key' : ''), authDomain: `${projectId}.firebaseapp.com` },
  authEmulator: local ? 'http://127.0.0.1:9099' : null
}));
api.post('/auth/redeem', wrap(async (req, res) => {
  await throttle(req, 'redeem');
  const token = req.body.token;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,80}$/.test(token)) throw fail('invalid_invitation', 401);
  const ref = db.collection('invitations').doc(hash(token));
  const invitation = row(await ref.get());
  if (!invitation) throw fail('invalid_invitation', 401);
  if (invitation.usedAt) throw fail('used_invitation', 401);
  if (invitation.expiresAt.toMillis() < now()) throw fail('expired_invitation', 401);
  const member = await get('members', invitation.memberId);
  const household = member && await get('households', member.householdId);
  if (!member?.active || !household?.active) throw fail('access_revoked', 403);
  // Mint before consuming: a signing configuration failure must not burn an invitation.
  const customToken = await auth.createCustomToken(member.id, { accessVersion: member.accessVersion || 0 });
  await db.runTransaction(async tx => {
    const fresh = await tx.get(ref);
    const m = await tx.get(db.collection('members').doc(member.id));
    const h = await tx.get(db.collection('households').doc(member.householdId));
    if (!fresh.exists) throw fail('invalid_invitation', 401);
    if (fresh.data().usedAt) throw fail('used_invitation', 401);
    if (fresh.data().expiresAt.toMillis() < now()) throw fail('expired_invitation', 401);
    if (!m.data()?.active || !h.data()?.active) throw fail('access_revoked', 403);
    if (m.data().activeInvitationHash !== ref.id || (m.data().accessVersion || 0) !== (member.accessVersion || 0)) throw fail('replaced_invitation', 401);
    tx.update(ref, { usedAt: now() });
    tx.update(m.ref, { activeInvitationHash: null });
  });
  res.json({ customToken });
}));
api.get('/me', memberAuth, (req, res) => res.json({ member: req.member, household: req.household }));
api.get('/households', memberAuth, wrap(async (req, res) => {
  res.json(rows(await db.collection('households').get()).filter(h => canSendTo(req.household, h)).map(h => ({ id: h.id, name: h.name, branches: h.branches })));
}));
api.get('/photos', memberAuth, wrap(async (req, res) => {
  const scope = req.query.scope || 'album';
  let query = db.collection('photos');
  if (scope === 'admin') { if (req.member.role !== 'admin') throw fail('admin_required', 403); }
  else if (scope === 'sent') query = query.where('ownerUid', '==', req.member.id);
  else if (scope === 'album') query = query.where('visibleTo', 'array-contains', req.member.householdId);
  else throw fail('invalid_scope');
  if (req.query.frameId !== undefined) {
    if (scope !== 'admin' || req.member.role !== 'admin') throw fail('admin_required', 403);
    const frame = await get('frames', req.query.frameId);
    if (!frame?.active) throw fail('frame_not_found', 404);
    query = query.where('visibleTo', 'array-contains', frame.householdId);
  }
  query = query.where('deleted', '==', false);
  const total = (await query.count().get()).data().count;
  query = query.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (req.query.offset && req.query.offset !== '0') {
    let cursor; try { cursor = JSON.parse(Buffer.from(String(req.query.offset), 'base64url').toString()); } catch { throw fail('invalid_cursor'); }
    if (!Array.isArray(cursor) || !Number.isFinite(cursor[0]) || typeof cursor[1] !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(cursor[1])) throw fail('invalid_cursor');
    query = query.startAfter(cursor[0], cursor[1]);
  }
  const photos = rows(await query.limit(61).get());
  const page = photos.slice(0, 60).map(p => ({
    id: p.id, caption: p.caption, ownerUid: p.ownerUid, ownerName: p.ownerName, createdAt: p.createdAt,
    width: p.width, height: p.height, fit: p.fit, bytes: p.bytes,
    recipientIds: p.ownerUid === req.member.id || scope === 'admin' ? p.recipientIds : undefined,
    canDelete: canDeletePhoto(req.member, p), canHide: isRecipient(p, req.member.householdId)
  }));
  const last = photos[59];
  res.json({ photos: page, total, nextOffset: photos.length > 60 ? Buffer.from(JSON.stringify([last.createdAt, last.id])).toString('base64url') : null });
}));
api.get('/photos/:id/image', memberAuth, wrap((req, res) => sendImage(req, res)));
api.post('/photos', memberAuth, wrap(async (req, res) => {
  await throttle(req, `upload:${req.member.id}`, 100);
  const ids = req.body.recipientIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 30 || ids.some(v => typeof v !== 'string')) throw fail('choose_recipients');
  const recipientIds = [...new Set(ids)];
  const recipients = await Promise.all(recipientIds.map(id => get('households', id)));
  if (recipients.some(h => !canSendTo(req.household, h))) throw fail('invalid_recipients', 403);
  const input = req.body.image;
  if (typeof input !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(input)) throw fail('unsupported_image');
  const image = Buffer.from(input.slice(input.indexOf(',') + 1), 'base64');
  if (!image.length || image.length > 8 * 1024 * 1024) throw fail('image_too_large', 413);
  let optimized, info, thumb;
  try {
    const result = await sharp(image, { limitInputPixels: 20_000_000, animated: false }).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#FFF8EF' }).jpeg({ quality: 84, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    optimized = result.data; info = result.info;
    thumb = await sharp(optimized).resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
  } catch { throw fail('invalid_image'); }
  const ref = db.collection('photos').doc();
  const storagePath = `photos/${ref.id}/photo.jpg`, thumbPath = `photos/${ref.id}/thumb.jpg`;
  try {
    await Promise.all([bucket.file(storagePath).save(optimized, { contentType: 'image/jpeg', metadata: { cacheControl: 'private, no-store' } }), bucket.file(thumbPath).save(thumb, { contentType: 'image/jpeg', metadata: { cacheControl: 'private, no-store' } })]);
    const batch = db.batch();
    batch.set(ref, { ownerUid: req.member.id, ownerHouseholdId: req.member.householdId, ownerName: req.member.name,
      recipientIds, visibleTo: recipientIds, hiddenFor: [], caption: text(req.body.caption), fit: ['contain', 'cover'].includes(req.body.fit) ? req.body.fit : 'contain',
      storagePath, thumbPath, sha256: hash(optimized), bytes: optimized.length, width: info.width, height: info.height, createdAt: now(), deleted: false });
    recipientIds.forEach(id => albumChanged(batch, id));
    await batch.commit();
  } catch (e) { await Promise.allSettled([bucket.file(storagePath).delete({ ignoreNotFound: true }), bucket.file(thumbPath).delete({ ignoreNotFound: true })]); throw e; }
  res.status(201).json({ id: ref.id, bytes: optimized.length, width: info.width, height: info.height });
}));
api.post('/photos/:id/hide', memberAuth, wrap(async (req, res) => {
  const photo = await get('photos', req.params.id);
  if (!photo || !isRecipient(photo, req.member.householdId)) throw fail('photo_not_found', 404);
  const batch = db.batch();
  batch.update(db.collection('photos').doc(photo.id), { hiddenFor: FieldValue.arrayUnion(req.member.householdId), visibleTo: FieldValue.arrayRemove(req.member.householdId) });
  albumChanged(batch, req.member.householdId);
  await batch.commit();
  res.json({ ok: true });
}));
api.delete('/photos/:id', memberAuth, wrap(async (req, res) => {
  const photo = await get('photos', req.params.id);
  if (!photo || !canDeletePhoto(req.member, photo)) throw fail('photo_not_found', 404);
  // Revoke access before removing the objects; a storage outage cannot leave them readable.
  const batch = db.batch();
  batch.update(db.collection('photos').doc(photo.id), { deleted: true, deletedAt: now() });
  photo.recipientIds.forEach(id => albumChanged(batch, id));
  await batch.commit();
  const deletion = await Promise.allSettled([bucket.file(photo.storagePath).delete({ ignoreNotFound: true }), bucket.file(photo.thumbPath).delete({ ignoreNotFound: true })]);
  await db.collection('photos').doc(photo.id).update({ storagePurged: deletion.every(r => r.status === 'fulfilled') });
  res.json({ ok: true });
}));
api.get('/frames', memberAuth, wrap(async (req, res) => {
  res.json(rows(await db.collection('frames').where('householdId', '==', req.member.householdId).get()).map(publicFrame));
}));
api.patch('/frames/:id/settings', memberAuth, wrap(async (req, res) => {
  const frame = await get('frames', req.params.id);
  if (!frame || (frame.householdId !== req.member.householdId && req.member.role !== 'admin')) throw fail('frame_not_found', 404);
  const settings = normalizeSettings(req.body, frame.settings);
  await db.collection('frames').doc(frame.id).update({ settings });
  res.json(settings);
}));

api.post('/frame/enroll', wrap(async (req, res) => {
  await throttle(req, 'frame-enroll');
  if (typeof req.body.token !== 'string' || !/^[A-Za-z0-9_-]{40,80}$/.test(req.body.token)) throw fail('invalid_invitation', 401);
  const enrollmentRef = db.collection('frameEnrollments').doc(hash(req.body.token));
  const token = secret();
  let frameResult;
  await db.runTransaction(async tx => {
    const enrollment = await tx.get(enrollmentRef);
    if (!enrollment.exists || enrollment.data().usedAt || enrollment.data().expiresAt.toMillis() < now()) throw fail('expired_invitation', 401);
    const frameRef = db.collection('frames').doc(enrollment.data().frameId);
    const frame = await tx.get(frameRef);
    if (!frame.data()?.active) throw fail('frame_access_revoked', 401);
    if (frame.data().activeEnrollmentHash !== enrollmentRef.id) throw fail('expired_invitation', 401);
    const household = await tx.get(db.collection('households').doc(frame.data().householdId));
    if (!household.data()?.active) throw fail('frame_access_revoked', 401);
    tx.update(frameRef, { tokenHash: hash(token), activeEnrollmentHash: null, enrolledAt: now(), lastSeen: now() });
    tx.update(enrollmentRef, { usedAt: now() });
    frameResult = { frameId: frame.id, householdId: household.id, householdName: household.data().name, settings: frame.data().settings };
  });
  res.json({ ...frameResult, token });
}));
api.post('/frame/realtime-session', frameAuth, wrap(async (req, res) => {
  const customToken = await auth.createCustomToken(`frame_${req.frame.id}`, {
    frameId: req.frame.id, householdId: req.frame.householdId, frameTokenHash: req.frame.tokenHash
  });
  res.json({ customToken, householdId: req.frame.householdId, firebase: {
    projectId, apiKey: process.env.MOSA_ANDROID_API_KEY || process.env.MOSA_FIREBASE_API_KEY || (local ? 'demo-mosa-key' : ''),
    appId: process.env.MOSA_ANDROID_APP_ID || (local ? '1:123:android:demo' : '')
  } });
}));
api.get('/frame/manifest', frameAuth, wrap(async (req, res) => {
  const version = hash(JSON.stringify([req.household.photoRevision || 0, req.household.name, req.frame.settings, req.frame.remoteUpdate?.id || null]));
  await db.collection('frames').doc(req.frame.id).update({ lastSeen: now() });
  if (req.query.version === version) return res.json({ unchanged: true, version, serverTime: now(), syncIntervalSeconds: 900 });
  const photos = rows(await db.collection('photos').where('visibleTo', 'array-contains', req.frame.householdId).get()).filter(p => isRecipient(p, req.frame.householdId)).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ version, householdId: req.frame.householdId, householdName: req.household.name,
    settings: req.frame.settings, updateRequest: req.frame.remoteUpdate || null, syncIntervalSeconds: 900, serverTime: now(),
    photos: photos.map(p => ({ id: p.id, sha256: p.sha256, bytes: p.bytes, width: p.width, height: p.height, fit: p.fit, caption: p.caption, path: `/api/frame/photos/${p.id}` })) });
}));
api.get('/frame/photos/:id', frameAuth, wrap((req, res) => sendImage(req, res, true)));
api.post('/frame/heartbeat', frameAuth, wrap(async (req, res) => {
  const versionCode = Number.isSafeInteger(req.body.appVersionCode) ? req.body.appVersionCode : 0;
  const changes = { lastSeen: now(), lastSync: now(), cachedPhotos: Math.max(0, Math.min(100000, Number(req.body.cachedPhotos) || 0)),
    appVersion: text(req.body.appVersion, 30), appVersionCode: versionCode, syncError: text(req.body.error, 150),
    remoteUpdates: req.body.remoteUpdates === true && versionCode >= 14, managed: req.body.managed === true,
    realtimeState: text(req.body.realtimeState, 30) };
  const ref = db.collection('frames').doc(req.frame.id);
  if (req.frame.remoteUpdate) {
    await db.runTransaction(async tx => {
      const frame = (await tx.get(ref)).data(), command = frame?.remoteUpdate;
      // A delayed acknowledgment must not overwrite a newer admin request.
      if (command && (versionCode >= command.targetVersion || command.id === req.body.updateRequestId)) {
        const status = text(req.body.updateState, 40);
        changes['remoteUpdate.state'] = versionCode >= command.targetVersion ? 'installed'
          : command.expiresAt < now() ? 'expired'
          : ['checking', 'downloading', 'installing', 'error', 'received'].includes(status) ? status
          : changes.managed ? 'retry_required' : 'manual_required';
        changes['remoteUpdate.reportedAt'] = now();
      }
      tx.update(ref, changes);
    });
  } else await ref.update(changes);
  res.json({ ok: true });
}));

api.use('/admin', memberAuth, adminAuth);
api.post('/admin/frames/:frameId/photos/:id/hide', wrap(async (req, res) => {
  const frame = await get('frames', req.params.frameId);
  const photo = await get('photos', req.params.id);
  if (!frame?.active) throw fail('frame_not_found', 404);
  if (!photo) throw fail('photo_not_found', 404);
  await db.runTransaction(async tx => {
    const frameRef = db.collection('frames').doc(frame.id);
    const photoRef = db.collection('photos').doc(photo.id);
    const currentFrame = (await tx.get(frameRef)).data();
    const currentPhoto = (await tx.get(photoRef)).data();
    if (!currentFrame?.active) throw fail('frame_not_found', 404);
    const householdId = currentFrame.householdId;
    const household = await tx.get(db.collection('households').doc(householdId));
    if (!household.exists) throw fail('household_not_found', 404);
    if (!currentPhoto || !isRecipient(currentPhoto, householdId)) throw fail('photo_not_found', 404);
    tx.update(photoRef, { hiddenFor: FieldValue.arrayUnion(householdId), visibleTo: FieldValue.arrayRemove(householdId) });
    albumChanged(tx, householdId);
  });
  res.json({ ok: true });
}));
api.get('/admin/overview', wrap(async (req, res) => {
  const [households, members, frames] = await Promise.all(['households', 'members', 'frames'].map(c => db.collection(c).get()));
  res.json({ households: rows(households), members: rows(members), frames: rows(frames).map(publicFrame) });
}));
api.post('/admin/frame-updates', wrap(async (req, res) => {
  const ids = req.body.frameIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 30 || ids.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id))) throw fail('choose_frames');
  // The client cannot nominate an APK, URL, signing key or arbitrary version.
  const origin = local ? 'http://127.0.0.1:5000' : 'https://mosa-506ef.web.app';
  const response = await fetch(`${origin}/updates/frame.json`, { signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store' });
  if (!response.ok) throw fail('update_unavailable', 503);
  const release = await response.json();
  if (release.packageName !== 'app.mosa.frame' || !Number.isSafeInteger(release.versionCode) || release.versionCode < 1
    || typeof release.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(release.sha256)
    || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(release.versionName || '')
    || release.path !== `/updates/mosa-frame-${release.versionCode}-${release.sha256}.apk`) throw fail('update_unavailable', 503);
  const frameIds = [...new Set(ids)];
  const command = { id: randomBytes(16).toString('hex'), targetVersion: release.versionCode, targetName: release.versionName,
    requestedAt: now(), expiresAt: now() + 7 * 86400000, state: 'queued' };
  await db.runTransaction(async tx => {
    const frames = await Promise.all(frameIds.map(id => tx.get(db.collection('frames').doc(id))));
    if (frames.some(f => !f.data()?.active || !f.data()?.tokenHash)) throw fail('frame_not_found', 404);
    if (frames.some(f => !f.data().remoteUpdates)) throw fail('update_bootstrap_required', 409);
    const householdIds = [...new Set(frames.map(f => f.data().householdId))];
    const households = await Promise.all(householdIds.map(id => tx.get(db.collection('households').doc(id))));
    if (households.some(h => !h.data()?.active)) throw fail('frame_access_revoked', 409);
    frames.forEach(f => tx.update(f.ref, { remoteUpdate: command }));
    householdIds.forEach(id => tx.set(db.collection('albumSignals').doc(id), { revision: FieldValue.increment(1) }, { merge: true }));
  });
  res.status(202).json({ frameIds, command });
}));
api.post('/admin/households', wrap(async (req, res) => {
  const ref = db.collection('households').doc();
  const data = { name: cleanName(req.body.name), branches: cleanBranches(req.body.branches), active: true, createdAt: now() };
  await ref.set(data); res.status(201).json({ id: ref.id, ...data });
}));
api.patch('/admin/households/:id', wrap(async (req, res) => {
  const household = await get('households', req.params.id); if (!household) throw fail('household_not_found', 404);
  const changes = {};
  if (req.body.name !== undefined) changes.name = cleanName(req.body.name);
  if (req.body.branches !== undefined) changes.branches = cleanBranches(req.body.branches);
  if (req.body.active !== undefined) { if (typeof req.body.active !== 'boolean') throw fail('invalid_active'); if (!req.body.active && household.id === req.member.householdId) throw fail('cannot_disable_admin_household'); changes.active = req.body.active; }
  await db.collection('households').doc(household.id).update(changes); res.json({ id: household.id, ...household, ...changes });
}));
api.delete('/admin/households/:id', wrap(async (req, res) => {
  const household = await get('households', req.params.id); if (!household) throw fail('household_not_found', 404);
  if (household.id === req.member.householdId) throw fail('cannot_disable_admin_household');
  await db.collection('households').doc(household.id).update({ active: false, deletedAt: now() });
  const members = rows(await db.collection('members').where('householdId', '==', household.id).get());
  await Promise.all(members.map(m => auth.revokeRefreshTokens(m.id)));
  res.json({ ok: true });
}));
api.post('/admin/members', wrap(async (req, res) => {
  const household = await get('households', req.body.householdId); if (!household?.active) throw fail('household_not_found', 404);
  const name = cleanName(req.body.name);
  const user = await auth.createUser({ displayName: name });
  const member = { name, householdId: household.id, role: 'member', active: true, createdAt: now() };
  try { await db.collection('members').doc(user.uid).set(member); } catch (e) { await auth.deleteUser(user.uid); throw e; }
  res.status(201).json({ id: user.uid, ...member });
}));
api.patch('/admin/members/:id', wrap(async (req, res) => {
  const member = await get('members', req.params.id); if (!member) throw fail('member_not_found', 404);
  const changes = {};
  if (req.body.name !== undefined) changes.name = cleanName(req.body.name);
  if (req.body.active !== undefined) {
    if (typeof req.body.active !== 'boolean') throw fail('invalid_active');
    if (!req.body.active && member.role === 'admin') throw fail('cannot_disable_admin');
    changes.active = req.body.active;
  }
  await db.collection('members').doc(member.id).update(changes);
  if (changes.active !== undefined) { await db.collection('members').doc(member.id).update({ accessVersion: FieldValue.increment(1), activeInvitationHash: null }); await auth.updateUser(member.id, { disabled: !changes.active }); await auth.revokeRefreshTokens(member.id); }
  res.json({ id: member.id, ...member, ...changes });
}));
api.post('/admin/members/:id/revoke', wrap(async (req, res) => {
  const member = await get('members', req.params.id); if (!member || member.role === 'admin') throw fail('cannot_revoke_admin');
  await db.collection('members').doc(member.id).update({ accessVersion: FieldValue.increment(1), activeInvitationHash: null });
  await auth.revokeRefreshTokens(member.id); res.json({ ok: true });
}));
api.post('/admin/invitations', wrap(async (req, res) => {
  const member = await get('members', req.body.memberId); if (!member?.active) throw fail('member_not_found', 404);
  const household = await get('households', member.householdId); if (!household?.active) throw fail('household_not_found', 404);
  const token = secret(), expiresAt = now() + 48 * 3600000;
  await db.runTransaction(async tx => {
    const ref = db.collection('members').doc(member.id); const fresh = await tx.get(ref);
    if (!fresh.data()?.active) throw fail('access_revoked', 403);
    tx.update(ref, { activeInvitationHash: hash(token) });
    tx.set(db.collection('invitations').doc(hash(token)), { memberId: member.id, expiresAt: Timestamp.fromMillis(expiresAt), createdAt: now(), usedAt: null });
  });
  res.status(201).json({ token, expiresAt, memberName: member.name });
}));
api.post('/admin/frames', wrap(async (req, res) => {
  const household = await get('households', req.body.householdId); if (!household?.active) throw fail('household_not_found', 404);
  const ref = db.collection('frames').doc();
  const data = { householdId: household.id, label: cleanName(req.body.label || household.name), active: true, tokenHash: null, createdAt: now(), settings: DEFAULT_SETTINGS, lastSeen: null, lastSync: null, cachedPhotos: 0 };
  await ref.set(data); res.status(201).json({ id: ref.id, ...publicFrame(data) });
}));
api.post('/admin/frames/:id/enrollment', wrap(async (req, res) => {
  const frame = await get('frames', req.params.id); if (!frame?.active) throw fail('frame_not_found', 404);
  const token = secret(), expiresAt = now() + 24 * 3600000;
  await db.runTransaction(async tx => {
    const ref = db.collection('frames').doc(frame.id); const fresh = await tx.get(ref);
    if (!fresh.data()?.active) throw fail('frame_access_revoked', 401);
    tx.update(ref, { activeEnrollmentHash: hash(token) });
    tx.set(db.collection('frameEnrollments').doc(hash(token)), { frameId: frame.id, expiresAt: Timestamp.fromMillis(expiresAt), createdAt: now(), usedAt: null });
  });
  res.json({ token, expiresAt, frameId: frame.id });
}));
api.delete('/admin/frames/:id', wrap(async (req, res) => {
  const frame = await get('frames', req.params.id); if (!frame) throw fail('frame_not_found', 404);
  await db.collection('frames').doc(frame.id).update({ active: false, tokenHash: null }); res.json({ ok: true });
}));
api.use((req, res) => res.status(404).json({ error: 'not_found' }));
app.use((error, req, res, next) => {
  const known = error.code || (/^invalid_/.test(error.message) ? error.message : null);
  const status = error.status || (known ? 400 : 500);
  if (!known && status === 500) console.error('Mosa API error:', error.message);
  res.status(status).json({ error: known || (status === 413 ? 'image_too_large' : 'server_error') });
});
