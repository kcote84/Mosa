const TOKEN = /^[A-Za-z0-9_-]{40,80}$/;
const MOSA_ORIGINS = ['https://mosa-506ef.web.app', 'https://mosa-506ef.firebaseapp.com'];

/** Extract the invitation without navigating away from the installed app. */
export function invitationFromInput(input, origin) {
  const value = String(input || '').trim();
  if (TOKEN.test(value)) return value;
  try {
    const url = new URL(value);
    const allowed = url.origin === origin || (MOSA_ORIGINS.includes(origin) && MOSA_ORIGINS.includes(url.origin));
    const token = new URLSearchParams(url.hash.slice(1)).get('invitation');
    if (allowed && !url.username && !url.password && url.pathname === '/' && TOKEN.test(token || '')) return token;
  } catch { /* Show a friendly error for an incomplete or unrelated link. */ }
  throw new Error('paste_invitation');
}

export function needsIosInstallGuide({ userAgent = '', platform = '', maxTouchPoints = 0, standalone = false, displayStandalone = false }) {
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  return ios && !standalone && !displayStandalone;
}
