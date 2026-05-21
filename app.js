const DB_NAME = 'notes-db';
const STORE = 'notes';

// --- IndexedDB: Cached Connection ---
let _db;
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

async function saveNote(note) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(note);
    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function getAllNotes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
}

// Fix #2 & #3: SW updates IndexedDB directly; client just re-renders on SYNC_DONE
async function deleteNote(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e.target.error);
  });
}

// --- Targeted DOM Update Helpers ---
function createNoteEl(note) {
  const li = document.createElement('li');
  li.dataset.id = note.id;

  const text = document.createElement('span');
  text.className = 'note-text';
  text.textContent = note.text; // Fix #1: textContent prevents XSS

  const badge = document.createElement('span');
  badge.className = note.synced ? 'synced' : 'pending';
  badge.textContent = note.synced ? '✔ Synced' : '⏳ Pending';

  const del = document.createElement('button');
  del.className = 'delete-btn';
  del.textContent = '✕';
  del.setAttribute('aria-label', 'Delete note');
  del.onclick = async () => {
    await deleteNote(note.id);
    li.remove();
    checkEmpty();
  };

  li.append(text, badge, del);
  return li;
}

function checkEmpty() {
  const list = document.getElementById('notes-list');
  let empty = document.getElementById('empty-state');
  if (!list.children.length) {
    if (!empty) {
      empty = document.createElement('p');
      empty.id = 'empty-state';
      empty.textContent = 'No notes yet. Add one above!';
      list.after(empty);
    }
  } else {
    empty?.remove();
  }
}

// Fix #8: targeted DOM update — prepend only the new note
function prependNote(note) {
  const list = document.getElementById('notes-list');
  list.prepend(createNoteEl(note));
  checkEmpty();
}

// Fix #8: targeted sync badge update instead of full re-render
function updateNoteBadge(id) {
  const li = document.querySelector(`li[data-id="${id}"]`);
  if (!li) return;
  const badge = li.querySelector('span:nth-child(2)');
  badge.className = 'synced';
  badge.textContent = '✔ Synced';
}

async function renderNotes() {
  const notes = await getAllNotes();
  const list = document.getElementById('notes-list');
  list.innerHTML = '';
  notes.reverse().forEach(note => list.appendChild(createNoteEl(note)));
  checkEmpty();
}

// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(() => {
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'SYNC_DONE') updateNoteBadge(e.data.id); // Fix #8
    });
  });
}

// --- Connectivity Status ---
function updateStatus() {
  document.getElementById('status').textContent =
    navigator.onLine ? '🟢 Online' : '🔴 Offline — notes saved locally';
}
window.addEventListener('online', updateStatus);
window.addEventListener('offline', updateStatus);
updateStatus();

// --- Fix #7: Sync Fallback ---
async function requestSync() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register('sync-notes');
  } else if (navigator.onLine) {
    // Fallback: sync immediately if online and SyncManager unavailable
    const notes = await getAllNotes();
    const pending = notes.filter(n => !n.synced);
    for (const note of pending) {
      try {
        await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: note.text, timestamp: note.timestamp }),
        });
        updateNoteBadge(note.id);
      } catch {
        // Will retry on next online event
      }
    }
  }
}

window.addEventListener('online', requestSync);

// --- Form Submit ---
document.getElementById('note-form').addEventListener('submit', async e => {
  e.preventDefault();
  const input = document.getElementById('note-input');
  const text = input.value.trim();
  if (!text) return;

  const id = await saveNote({ text, synced: false, timestamp: Date.now() });
  input.value = '';
  prependNote({ id, text, synced: false }); // Fix #8: no full re-render
  await requestSync();
});

renderNotes();
