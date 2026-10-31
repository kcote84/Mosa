import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSendTo, isRecipient, canReadPhoto, canDeletePhoto, normalizeSettings } from '../functions/src/policy.js';
const viel = { active: true, branches: ['viel'] }, cote = { active: true, branches: ['cote'] }, both = { active: true, branches: ['viel', 'cote'] };
test('les familles restent séparées; le foyer central appartient aux deux', () => {
  assert.equal(canSendTo(viel, cote), false); assert.equal(canSendTo(cote, viel), false);
  assert.equal(canSendTo(viel, both), true); assert.equal(canSendTo(cote, both), true);
  assert.equal(canSendTo(both, viel), true); assert.equal(canSendTo(both, cote), true);
  assert.equal(canSendTo(viel, { ...viel, active: false }), false);
});
test('une exclusion concerne l’album ET le cadre, y compris celui de l’admin', () => {
  const photo = { recipientIds: ['home-a1'], hiddenFor: [], ownerUid: 'a2-member' };
  const admin = { id: 'admin-demo', active: true, role: 'admin', householdId: 'home-hub' };
  assert.equal(isRecipient(photo, 'home-hub'), false); assert.equal(canReadPhoto(admin, photo), false);
  assert.equal(canReadPhoto(admin, photo, { moderation: true }), true);
  assert.equal(canReadPhoto({ id: 'home-a3', active: true, householdId: 'home-a3' }, photo), false);
});
test('masquer chez soi ne supprime pas la photo chez un autre destinataire', () => {
  const photo = { recipientIds: ['home-a3', 'home-a1'], hiddenFor: ['home-a3'], ownerUid: 'a2-member' };
  assert.equal(isRecipient(photo, 'home-a3'), false); assert.equal(isRecipient(photo, 'home-a1'), true);
  assert.equal(canDeletePhoto({ id: 'home-a3', active: true }, photo), false);
  assert.equal(canDeletePhoto({ id: 'a2-member', active: true }, photo), true);
});
test('une photo retirée ne reste pas consultable par son auteur ni un admin', () => {
  const photo = { recipientIds: ['kv'], ownerUid: 'admin-demo', deleted: true };
  assert.equal(canReadPhoto({ id: 'admin-demo', active: true, role: 'admin' }, photo, { moderation: true }), false);
  assert.equal(isRecipient(photo, 'kv'), false);
});
test('les réglages refusent les valeurs susceptibles de bloquer le diaporama', () => {
  assert.throws(() => normalizeSettings({ intervalSeconds: 0 })); assert.throws(() => normalizeSettings({ nightStart: '25:99' }));
  assert.throws(() => normalizeSettings({ locale: 'unknown' })); assert.equal(normalizeSettings({ locale: 'en', intervalSeconds: 30 }).locale, 'en');
  assert.throws(() => normalizeSettings({ timeZone: 'Unknown/Timezone' }));
});
