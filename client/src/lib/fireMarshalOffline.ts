const DB_NAME = 'tpr-marshal-outbox';
const DB_VERSION = 1;
const STORE = 'outbox';

export interface OutboxItem {
  id?: number;
  personId: string;
  urlId: string;
  evacuationId: string | null;
  marshalName: string;
  statusOption?: string;
  markedAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

export async function addToOutbox(item: Omit<OutboxItem, 'id'>): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOutboxCount(): Promise<number> {
  const db = await openDB();
  return new Promise<number>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

async function getAllOutboxItems(): Promise<OutboxItem[]> {
  const db = await openDB();
  return new Promise<OutboxItem[]>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as OutboxItem[]);
    req.onerror = () => reject(req.error);
  });
}

async function removeOutboxItem(id: number): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearMusterCache(): Promise<void> {
  try {
    if ('caches' in window) {
      await Promise.all([
        caches.delete('tpr-marshal-shell-v1'),
        caches.delete('tpr-marshal-data-v1'),
      ]);
    }
  } catch { /* ignore */ }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

export function registerFireMarshalSW(): void {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => console.warn('[FireMarshal SW] Registration failed:', err));

    // Register Background Sync when connection returns (Android Chrome)
    navigator.serviceWorker.ready.then((reg: ServiceWorkerRegistration) => {
      window.addEventListener('online', () => {
        if ('sync' in (reg as any)) {
          (reg as any).sync.register('flush-mark-safe').catch(() => {});
        }
      });
    });
  }
}

export async function flushMarkSafeOutbox({
  urlId,
  marshalName,
  onSuccess,
}: {
  urlId: string;
  marshalName: string;
  onSuccess: (personId: string) => void;
}): Promise<number> {
  const items = await getAllOutboxItems();
  if (items.length === 0) return 0;

  let remaining = items.length;
  for (const item of items) {
    try {
      const res = await fetch(`/api/emergency/mark-safe/${item.personId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Fire-Marshal-Id': item.urlId || urlId,
        },
        body: JSON.stringify({
          musterPoint: 'Safe Location',
          evacuationId: item.evacuationId || 'standalone',
          marshalName: item.marshalName || marshalName,
          statusOption: item.statusOption,
          markedAt: item.markedAt,
        }),
      });
      if (res.ok && item.id !== undefined) {
        await removeOutboxItem(item.id);
        remaining--;
        onSuccess(item.personId);
      }
    } catch { /* keep for next attempt */ }
  }
  return remaining;
}
