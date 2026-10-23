/**
 * Cola offline de escaneos en IndexedDB. Solo guarda lo mínimo (código, hora, dispositivo)
 * y se vacía al sincronizar. No se guardan nombres ni fotos en el teléfono.
 */
import type { ScanEvent } from "@insedu/domain";

const DB = "insedu-scans";
const STORE = "queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "clientId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const enqueue = (ev: ScanEvent) => tx("readwrite", (s) => s.put(ev));
export const pending = () => tx<ScanEvent[]>("readonly", (s) => s.getAll() as IDBRequest<ScanEvent[]>);
export const remove = (clientId: string) => tx("readwrite", (s) => s.delete(clientId));
export const clearAll = () => tx("readwrite", (s) => s.clear());

export function deviceId(): string {
  const k = "insedu-device-id";
  let id = localStorage.getItem(k);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(k, id);
  }
  return id;
}
