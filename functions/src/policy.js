import { BRANCHES } from './families.js';
export { BRANCHES } from './families.js';
export const DEFAULT_SETTINGS = { locale: 'fr', intervalSeconds: 60, fit: 'contain', nightEnabled: true, nightStart: '23:00', nightEnd: '05:00', timeZone: 'America/Toronto' };
export function intersects(a = [], b = []) { return a.some(value => b.includes(value)); }
export function canSendTo(senderHousehold, recipientHousehold) {
  return Boolean(senderHousehold?.active && recipientHousehold?.active && intersects(senderHousehold.branches, recipientHousehold.branches));
}
export function isRecipient(photo, householdId) {
  return !photo.deleted && photo.recipientIds?.includes(householdId) && !photo.hiddenFor?.includes(householdId);
}
export function canReadPhoto(member, photo, { moderation = false } = {}) {
  if (!member?.active || photo.deleted) return false;
  return isRecipient(photo, member.householdId) || photo.ownerUid === member.id || (moderation && member.role === 'admin');
}
export function canDeletePhoto(member, photo) { return Boolean(member?.active && (photo.ownerUid === member.id || member.role === 'admin')); }
export function normalizeSettings(input = {}, previous = DEFAULT_SETTINGS) {
  const result = { ...DEFAULT_SETTINGS, ...previous };
  if (input.locale !== undefined) { if (!['fr', 'en'].includes(input.locale)) throw new Error('invalid_locale'); result.locale = input.locale; }
  if (input.intervalSeconds !== undefined) { if (![8, 15, 30, 60].includes(input.intervalSeconds)) throw new Error('invalid_interval'); result.intervalSeconds = input.intervalSeconds; }
  if (input.fit !== undefined) { if (!['contain', 'cover'].includes(input.fit)) throw new Error('invalid_fit'); result.fit = input.fit; }
  if (input.nightEnabled !== undefined) { if (typeof input.nightEnabled !== 'boolean') throw new Error('invalid_night'); result.nightEnabled = input.nightEnabled; }
  if (input.timeZone !== undefined) {
    if (typeof input.timeZone !== 'string' || input.timeZone.length > 80) throw new Error('invalid_timezone');
    try { new Intl.DateTimeFormat('fr', { timeZone: input.timeZone }).format(); } catch { throw new Error('invalid_timezone'); }
    result.timeZone = input.timeZone;
  }
  for (const key of ['nightStart', 'nightEnd']) if (input[key] !== undefined) {
    if (typeof input[key] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input[key])) throw new Error('invalid_time'); result[key] = input[key];
  }
  return result;
}
export function cleanName(value, max = 80) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error('invalid_name');
  return value.trim();
}
export function cleanBranches(value) {
  if (!Array.isArray(value) || !value.length || value.some(b => !BRANCHES.includes(b))) throw new Error('invalid_branches');
  return [...new Set(value)];
}
