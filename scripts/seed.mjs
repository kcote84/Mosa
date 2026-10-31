import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminContext } from './admin-context.mjs';
import { DEFAULT_SETTINGS } from '../functions/src/policy.js';
const local = process.argv.includes('--local');
if (!local && !process.argv.includes('--production')) throw new Error('Choisir --local ou --production explicitement.');
const { db, auth, projectId } = adminContext(local);
const fixture = process.argv.includes('--fixture');
if (fixture && !local) throw new Error('Les foyers de test sont réservés aux émulateurs.');
const configuration = JSON.parse(await readFile(fixture ? 'tests/fixtures/family.json' : '.local/family.json', 'utf8'));
const { households, adminId, initialFrame } = configuration;
if (!households.some(h => h[3].some(m => m[0] === adminId && m[2] === 'admin'))) throw new Error('Administrateur absent de la configuration.');
const frameHome = households.find(h => h[0] === initialFrame.householdId);
if (!frameHome) throw new Error('Foyer du cadre initial absent.');
for (const [id, name, branches, members] of households) {
  const ref = db.collection('households').doc(id);
  if (!(await ref.get()).exists) await ref.set({ name, branches, active: true, createdAt: Date.now(), photoRevision: 0 });
  for (const [uid, memberName, role = 'member'] of members) {
    try { await auth.getUser(uid); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; await auth.createUser({ uid, displayName: memberName }); }
    const memberRef = db.collection('members').doc(uid);
    if (!(await memberRef.get()).exists) await memberRef.set({ name: memberName, householdId: id, role, active: true, accessVersion: 0, createdAt: Date.now() });
  }
}
const frameRef = db.collection('frames').doc(initialFrame.id);
if (!(await frameRef.get()).exists) await frameRef.set({ householdId: initialFrame.householdId, label: frameHome[1], active: true, tokenHash: null, settings: DEFAULT_SETTINGS, createdAt: Date.now(), lastSeen: null, lastSync: null, cachedPhotos: 0 });
await mkdir('.local', { recursive: true });
const token = randomBytes(32).toString('base64url');
const digest = createHash('sha256').update(token).digest('hex');
await db.runTransaction(async tx => {
  tx.update(db.collection('members').doc(adminId), { activeInvitationHash: digest });
  tx.set(db.collection('invitations').doc(digest), { memberId: adminId, expiresAt: Timestamp.fromMillis(Date.now() + 48 * 3600000), usedAt: null, createdAt: Date.now() });
});
const origin = local ? 'http://127.0.0.1:5000' : 'https://mosa-506ef.web.app';
await writeFile(`.local/${local ? 'local' : 'production'}-admin-invitation.json`, JSON.stringify({ url: `${origin}/#invitation=${token}`, expires: new Date(Date.now() + 48 * 3600000).toISOString() }, null, 2));
console.log(`Mosa ${projectId}: ${households.length} foyers préparés. Lien administrateur enregistré dans .local (non publié).`);
process.exit(0);
