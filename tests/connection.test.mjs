import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invitationFromInput, invitationUrl, needsIosInstallGuide } from '../web/src/connection.js';
const token = 'a'.repeat(43), origin = 'https://mosa-506ef.web.app';
test('une invitation collée se connecte dans la même app, avec espaces ou domaine Firebase équivalent', () => {
  assert.equal(invitationFromInput(`  ${origin}/#invitation=${token}\n`, origin), token);
  assert.equal(invitationFromInput(`https://mosa-506ef.firebaseapp.com/#invitation=${token}`, origin), token);
  assert.equal(invitationFromInput(token, origin), token);
  assert.equal(invitationUrl(origin, token), `${origin}/connexion/#invitation=${token}`);
  assert.equal(invitationFromInput(invitationUrl(origin, token), origin), token);
});
test('liens étrangers, incomplets et adresses trompeuses refusés', () => {
  for (const value of [origin, '', 'un message', `${origin}.example.com/#invitation=${token}`, `https://user@${new URL(origin).host}/#invitation=${token}`, `https://example.com/#invitation=${token}`, `${origin}/#invitation=short`]) {
    assert.throws(() => invitationFromInput(value, origin), /paste_invitation/);
  }
});
test('Safari iPhone et iPad ne consomment pas le lien avant le guide d’installation', () => {
  assert.equal(needsIosInstallGuide({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }), true);
  assert.equal(needsIosInstallGuide({ platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(needsIosInstallGuide({ userAgent: 'iPhone', standalone: true }), false);
  assert.equal(needsIosInstallGuide({ userAgent: 'iPhone', displayStandalone: true }), false);
  assert.equal(needsIosInstallGuide({ userAgent: 'Android' }), false);
  assert.equal(needsIosInstallGuide({ platform: 'MacIntel', maxTouchPoints: 0 }), false);
});
