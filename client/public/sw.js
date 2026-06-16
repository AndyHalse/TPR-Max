const SHELL_CACHE = 'tpr-marshal-shell-v1';
const DATA_CACHE  = 'tpr-marshal-data-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k =>
              (k.startsWith('tpr-marshal-shell-') || k.startsWith('tpr-marshal-data-')) &&
              k !== SHELL_CACHE && k !== DATA_CACHE
            )
            .map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // ── Fire Marshal API data: network-first, fall back to cache ──────────
  if (
    url.pathname.match(/^\/api\/emergency\/fire-marshal\/.+/) ||
    url.pathname.startsWith('/api/emergency/zone-sweeps/')
  ) {
    event.respondWith(
      fetch(request.clone())
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(DATA_CACHE).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then(cached => cached || Response.error())
        )
    );
    return;
  }

  // ── Navigation to /fire-marshal/*: serve cached app shell if offline ──
  if (request.mode === 'navigate' && url.pathname.startsWith('/fire-marshal')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            caches.open(SHELL_CACHE).then(c => c.put(new Request('/'), res.clone()));
          }
          return res;
        })
        .catch(() =>
          caches.match('/').then(cached => cached || caches.match(request))
        )
    );
    return;
  }

  // ── Static assets: stale-while-revalidate ─────────────────────────────
  if (['script', 'style', 'font', 'image'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request)
          .then(res => {
            if (res.ok) caches.open(SHELL_CACHE).then(c => c.put(request, res.clone()));
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }
  // All other requests: browser default (no SW interception)
});

// Background Sync: flush mark-safe outbox when connectivity returns
self.addEventListener('sync', (event) => {
  if (event.tag === 'flush-mark-safe') {
    event.waitUntil(swFlushOutbox());
  }
});

async function swFlushOutbox() {
  const db = await swOpenDB();
  const items = await swGetAll(db);
  for (const item of items) {
    try {
      const res = await fetch(`/api/emergency/mark-safe/${item.personId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Fire-Marshal-Id': item.urlId || '',
        },
        body: JSON.stringify({
          musterPoint: 'Safe Location',
          evacuationId: item.evacuationId || 'standalone',
          marshalName: item.marshalName,
          statusOption: item.statusOption,
          markedAt: item.markedAt,
        }),
      });
      if (res.ok && item.id != null) await swDelete(db, item.id);
    } catch { /* keep for next sync attempt */ }
  }
}

function swOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('tpr-marshal-outbox', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}
function swGetAll(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function swDelete(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    tx.objectStore('outbox').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
