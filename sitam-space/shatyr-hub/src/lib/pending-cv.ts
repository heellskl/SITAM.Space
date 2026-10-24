// Keeps the CV chosen on the sign-up form until the account has a session.
//
// Why: with e-mail confirmation on, signUp() returns no session, so Storage
// rejects the upload (the original bug: "CV is not saved at registration").
// The register form verifies the 6-digit code in place and uploads immediately;
// if the person clicks the e-mail link instead, the file waits here (IndexedDB,
// this browser only) and auth.tsx uploads it on the first sign-in.

const DB = 'sitam';
const STORE = 'pending-cv';

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function savePendingCv(email: string, file: File): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ file, name: file.name, savedAt: Date.now() }, email.toLowerCase());
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** Returns and deletes the pending CV for this e-mail (if saved within 7 days). */
export async function takePendingCv(email: string): Promise<File | null> {
  if (!email) return null;
  const db = await open();
  if (!db) return null;
  const key = email.toLowerCase();
  const value = await new Promise<{ file: Blob; name: string; savedAt: number } | undefined>((resolve) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as { file: Blob; name: string; savedAt: number } | undefined);
    req.onerror = () => resolve(undefined);
  });
  if (!value) return null;
  db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
  if (Date.now() - value.savedAt > 7 * 86_400_000) return null;
  return new File([value.file], value.name || 'cv.pdf', { type: 'application/pdf' });
}
