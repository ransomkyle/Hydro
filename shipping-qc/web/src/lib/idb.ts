/** Tiny promise wrapper over IndexedDB: a key/value cache of API reads and the outbox of queued actions. */
const DB_NAME = 'shipping-qc';
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('cache');
      r.result.createObjectStore('outbox', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const idb = {
  get: <T>(store: string, key: string) => tx<T | undefined>(store, 'readonly', s => s.get(key)),
  put: (store: string, value: unknown, key?: string) => tx(store, 'readwrite', s => (key === undefined ? s.put(value) : s.put(value, key))),
  del: (store: string, key: string) => tx(store, 'readwrite', s => s.delete(key)),
  all: <T>(store: string) => tx<T[]>(store, 'readonly', s => s.getAll()),
  clear: (store: string) => tx(store, 'readwrite', s => s.clear()),
};
