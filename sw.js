// Fix #10: bump this string whenever static assets change
const CACHE_NAME = 'notes-cache-v3';
const BASE = '/offline-note-taking-app';
const ASSETS = [BASE + '/', BASE + '/index.html', BASE + '/style.css', BASE + '/app.js', BASE + '/manifest.json'];

// --- Install: Cache Static Assets ---
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// --- Activate: Clean Old Caches ---
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// --- Fetch: Cache First, Fallback to Network ---
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// --- Background Sync ---
self.addEventListener('sync', e => {
  if (e.tag === 'sync-notes') e.waitUntil(syncNotes());
});

async function syncNotes() {
  const db = await openDB();
  const pending = await getPending(db);

  for (const note of pending) {
    try {
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: note.text, timestamp: note.timestamp }),
      });

      // Fix #3: SW marks note synced in IndexedDB directly
      await markSynced(db, note.id);

      // Notify client to update badge (no DB call needed on client side)
      const clients = await self.clients.matchAll();
      clients.forEach(c => c.postMessage({ type: 'SYNC_DONE', id: note.id }));
    } catch {
      // Network failed — browser will retry the sync automatically
    }
  }
}

// --- IndexedDB Helpers (SW scope) ---
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('notes-db', 1);
    req.onupgradeneeded = e =>
      e.target.result.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

function getPending(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction('notes', 'readonly').objectStore('notes').getAll();
    req.onsuccess = () => resolve(req.result.filter(n => !n.synced));
    req.onerror = e => reject(e.target.error);
  });
}

// Fix #2 & #3: clean async transaction, no async-in-Promise constructor
function markSynced(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readwrite');
    const store = tx.objectStore('notes');
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const note = getReq.result;
      if (!note) return resolve();
      note.synced = true;
      const putReq = store.put(note);
      putReq.onsuccess = () => resolve();
      putReq.onerror = e => reject(e.target.error);
    };
    getReq.onerror = e => reject(e.target.error);
  });
}
