import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, onAuthStateChanged, signInWithCustomToken, signOut, setPersistence, indexedDBLocalPersistence } from 'firebase/auth';
let auth;
export async function initializeSession(listener) {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('server_error');
  const config = await response.json();
  if (!config.firebase.apiKey) throw new Error('not_configured');
  auth = getAuth(initializeApp(config.firebase));
  if (config.local) connectAuthEmulator(auth, config.authEmulator, { disableWarnings: true });
  await setPersistence(auth, indexedDBLocalPersistence);
  const unsubscribe = onAuthStateChanged(auth, user => listener(user, config));
  return unsubscribe;
}
export async function redeemInvitation(token) {
  const { customToken } = await request('/auth/redeem', { method: 'POST', body: { token }, anonymous: true });
  await signInWithCustomToken(auth, customToken);
}
export async function logout() { await signOut(auth); }
export async function request(path, { method = 'GET', body, anonymous = false, blob = false, signal } = {}) {
  const headers = {};
  if (!anonymous) {
    if (!auth?.currentUser) throw new Error('sign_in_required');
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'server_error');
  }
  return blob ? response.blob() : response.json();
}
