const DB_NAME = 'tpr-marshal-outbox';
const DB_VERSION = 1;
const STORE = 'outbox';

export type OutboxKind = 'mark-safe' | 'mark-zone-safe' | 'note';

export interface OutboxItem {
  id?: number;
  kind?: OutboxKind;        // undefined / missing → treated as 'mark-safe' for backward compat
  personId: string;         // '' for note items
  urlId: string;
  evacuationId: string | null;
  marshalName: string;
  statusOption?: string;    // for mark-safe with a status dropdown option
  text?: string;            // for note items
  markedAt: string;         // ISO string of when the marshal acted (not when synced)
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

/**
 * Flush all queued outbox items in insertion order.
 * Each item is dispatched to the correct endpoint based on its `kind`:
 *   - 'mark-safe' / 'mark-zone-safe' → POST /api/emergency/mark-safe/:personId
 *   - 'note'                         → POST /api/emergency/evacuation-note
 *
 * On success each item is removed from IndexedDB.
 * On failure it is kept for the next flush attempt.
 * Returns the number of items still remaining after the flush.
 */
export async function flushOutbox({
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
    const kind: OutboxKind = item.kind || 'mark-safe';
    try {
      let ok = false;
      const marshalHeader = item.urlId || urlId;
      const resolvedMarshal = item.marshalName || marshalName;

      if (kind === 'mark-safe' || kind === 'mark-zone-safe') {
        const res = await fetch(`/api/emergency/mark-safe/${item.personId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Fire-Marshal-Id': marshalHeader,
          },
          body: JSON.stringify({
            musterPoint: 'Safe Location',
            evacuationId: item.evacuationId || 'standalone',
            marshalName: resolvedMarshal,
            statusOption: item.statusOption,
            markedAt: item.markedAt,    // server uses the time the marshal acted
          }),
        });
        ok = res.ok;
      } else if (kind === 'note') {
        const res = await fetch('/api/emergency/evacuation-note', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Fire-Marshal-Id': marshalHeader,
          },
          body: JSON.stringify({
            evacuationId: item.evacuationId,
            noteText: item.text || '',
            marshalName: resolvedMarshal,
            markedAt: item.markedAt,    // original action timestamp
          }),
        });
        ok = res.ok;
      }

      if (ok && item.id !== undefined) {
        await removeOutboxItem(item.id);
        remaining--;
        onSuccess(item.personId);
      }
    } catch { /* network error — keep for next attempt */ }
  }
  return remaining;
}

/** Backward-compat alias — existing call sites keep working. */
export const flushMarkSafeOutbox = flushOutbox;
