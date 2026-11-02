const SHARE_ID = /^[a-f0-9-]{36}$/i;
const SHARE_ERRORS = new Set(['share_empty', 'share_too_many', 'share_too_large', 'unsupported_image', 'image_too_large', 'share_storage_full', 'share_expired']);

export function sharedIntent(url) {
  const params = new URL(url).searchParams;
  const id = params.get('share');
  const error = params.get('share-error');
  if (id) return SHARE_ID.test(id) ? { id } : { error: 'share_expired' };
  return error ? { error: SHARE_ERRORS.has(error) ? error : 'share_empty' } : null;
}

export function clearSharedUrl() {
  const url = new URL(location.href);
  url.searchParams.delete('share'); url.searchParams.delete('share-error');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}

function inboxMessage(type, id) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); channel.port1.close(); channel.port2.close();
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('share_unavailable')), 15000);
    channel.port1.onmessage = event => finish(event.data.error ? new Error(event.data.error) : null, event.data);
    channel.port1.onmessageerror = () => finish(new Error('share_unavailable'));
    if (!navigator.serviceWorker) return finish(new Error('share_unavailable'));
    navigator.serviceWorker.ready.then(registration => {
      if (settled) return;
      if (!registration.active) return finish(new Error('share_unavailable'));
      registration.active.postMessage({ type, id }, [channel.port2]);
    }).catch(() => finish(new Error('share_unavailable')));
  });
}

export const readSharedPhotos = id => inboxMessage('MOSA_SHARE_GET', id).then(result => result.files);
export const removeSharedPhotos = id => inboxMessage('MOSA_SHARE_REMOVE', id);
export async function clearSharedPhotos() {
  if (await navigator.serviceWorker?.getRegistration()) await inboxMessage('MOSA_SHARE_CLEAR');
}
