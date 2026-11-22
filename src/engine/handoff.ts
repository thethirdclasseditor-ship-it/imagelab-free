const DB_NAME = 'imagelab_handoff_db';
const STORE_NAME = 'pending';
const RECORD_KEY = 'latest_file';
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

interface HandoffRecord {
  blob: Blob;
  name: string;
  type: string;
  savedAt: number;
}

function openHandoffDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open handoff store'));
  });
}

export async function saveHandoffFile(blob: Blob, fileName: string): Promise<void> {
  const db = await openHandoffDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: HandoffRecord = {
        blob,
        name: fileName,
        type: blob.type || 'image/png',
        savedAt: Date.now(),
      };
      store.put(record, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save handoff file'));
    });
  } finally {
    db.close();
  }
}

export async function sendFileToTool(
  blob: Blob,
  fileName: string,
  targetPath: string
): Promise<void> {
  await saveHandoffFile(blob, fileName);
  const sep = targetPath.includes('?') ? '&' : '?';
  window.location.href = `${targetPath}${sep}handoff=1`;
}

/** Reads and deletes any pending handoff file when a page opens with ?handoff=1 */
export async function consumeHandoffFile(): Promise<File | null> {
  if (typeof window === 'undefined') return null;

  const url = new URL(window.location.href);
  if (url.searchParams.get('handoff') !== '1') return null;

  // Clean ?handoff=1 from the address bar immediately so refresh stays clean
  url.searchParams.delete('handoff');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);

  try {
    const db = await openHandoffDb();
    try {
      const record = await new Promise<HandoffRecord | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(RECORD_KEY);
        getReq.onsuccess = () => {
          const val = getReq.result as HandoffRecord | undefined;
          store.delete(RECORD_KEY);
          resolve(val);
        };
        getReq.onerror = () => reject(getReq.error);
      });

      if (!record || !record.blob) return null;
      if (Date.now() - record.savedAt > MAX_AGE_MS) return null;

      return new File([record.blob], record.name || 'image.png', {
        type: record.type || record.blob.type || 'image/png',
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
