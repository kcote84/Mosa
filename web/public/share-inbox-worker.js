/* Local inbox for Android shares. No image is uploaded by this worker. */
(() => {
  const DATABASE = 'mosa-share-inbox';
  const STORE = 'batches';
  const TTL = 60 * 60 * 1000;
  const MAX_BYTES = 250 * 1024 * 1024;
  const ID = /^[a-f0-9-]{36}$/i;
  const TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
  const ERRORS = new Set(['share_empty', 'share_too_many', 'share_too_large', 'unsupported_image', 'image_too_large', 'share_storage_full', 'share_expired']);

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('share_storage_full'));
    });
  }

  async function transact(action, payload) {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        let result, failure;
        const now = Date.now();
        const cursor = store.openCursor();
        let bytes = 0, batches = 0;
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (entry) {
            if (action === 'clear' || entry.value.expiresAt <= now) entry.delete();
            else { bytes += entry.value.bytes; batches++; }
            entry.continue();
            return;
          }
          if (action === 'put') {
            if (batches >= 3 || bytes + payload.bytes > MAX_BYTES) {
              failure = new Error('share_storage_full'); return;
            }
            store.add(payload);
            result = payload.id;
          } else if (action === 'get') {
            const request = store.get(payload);
            request.onsuccess = () => { result = request.result; };
          } else if (action === 'remove') store.delete(payload);
        };
        tx.oncomplete = () => failure ? reject(failure) : resolve(result);
        tx.onabort = tx.onerror = () => reject(new Error('share_storage_full'));
      });
    } finally { db.close(); }
  }

  function validate(files) {
    if (!files.length) throw new Error('share_empty');
    if (files.length > 50) throw new Error('share_too_many');
    let bytes = 0;
    for (const file of files) {
      if (!(file instanceof Blob) || !file.size) throw new Error('unsupported_image');
      const type = file.type.toLowerCase();
      const extensionOnly = (!type || type === 'application/octet-stream') && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || '');
      if (!TYPES.has(type) && !extensionOnly) throw new Error('unsupported_image');
      if (file.size > 40 * 1024 * 1024) throw new Error('image_too_large');
      bytes += file.size;
    }
    if (bytes > MAX_BYTES) throw new Error('share_too_large');
    return bytes;
  }

  const redirect = params => new Response(null, { status: 303, headers: {
    Location: `/?${new URLSearchParams(params)}`, 'Cache-Control': 'no-store'
  } });

  async function receive(request) {
    try {
      const origin = request.headers.get('Origin');
      if (origin && origin !== 'null' && origin !== self.location.origin) throw new Error('share_empty');
      if (Number(request.headers.get('Content-Length')) > MAX_BYTES + 1024 * 1024) throw new Error('share_too_large');
      const form = await request.formData();
      const files = form.getAll('photos');
      const bytes = validate(files);
      const id = crypto.randomUUID();
      await transact('put', { id, files, bytes, expiresAt: Date.now() + TTL });
      return redirect({ share: id });
    } catch (error) {
      return redirect({ 'share-error': ERRORS.has(error.message) ? error.message : 'share_empty' });
    }
  }

  self.MosaShareInbox = { receive, cleanup: () => transact('cleanup') };
  self.addEventListener('message', event => {
    if (!['MOSA_SHARE_GET', 'MOSA_SHARE_REMOVE', 'MOSA_SHARE_CLEAR'].includes(event.data?.type) || !event.ports?.[0]) return;
    const port = event.ports[0];
    event.waitUntil((async () => {
      try {
        const client = event.source?.id && await self.clients.get(event.source.id);
        if (!client || new URL(client.url).origin !== self.location.origin) return;
        const { type, id } = event.data;
        if (type !== 'MOSA_SHARE_CLEAR' && !ID.test(id || '')) throw new Error('share_expired');
        if (type === 'MOSA_SHARE_GET') {
          const batch = await transact('get', id);
          if (!batch) throw new Error('share_expired');
          port.postMessage({ files: batch.files });
        } else {
          await transact(type === 'MOSA_SHARE_CLEAR' ? 'clear' : 'remove', id);
          port.postMessage({ ok: true });
        }
      } catch (error) { port.postMessage({ error: ERRORS.has(error.message) ? error.message : 'share_storage_full' }); }
    })());
  });
})();
