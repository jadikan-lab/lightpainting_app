// Wrapper IndexedDB minimal pour stocker les médias (photos + vidéos) en local.
const MediaDB = (() => {
  const DB_NAME = 'lightpainting-db';
  const DB_VERSION = 1;
  const STORE = 'media';

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function addMedia({ type, blob, thumbnail, mimeType }) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const record = { type, blob, thumbnail, mimeType, createdAt: Date.now() };
      const req = store.add(record);
      req.onsuccess = () => resolve({ ...record, id: req.result });
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllMedia() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.createdAt - a.createdAt));
      req.onerror = () => reject(req.error);
    });
  }

  async function getMedia(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getStorageStats() {
    const items = await getAllMedia();
    const bytes = items.reduce((sum, item) => sum + (item.blob?.size || 0) + (item.thumbnail?.size || 0), 0);
    return { count: items.length, bytes };
  }

  async function clearAll() {
    const items = await getAllMedia();
    for (const item of items) await deleteMedia(item.id);
  }

  async function deleteMedia(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  return { addMedia, getAllMedia, getMedia, deleteMedia, getStorageStats, clearAll };
})();
