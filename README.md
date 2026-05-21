# 📝 Offline Notes

A simple offline-capable note-taking PWA (Progressive Web App) that stores notes locally and syncs them when back online.

🔗 **Live Demo:** https://marandi290.github.io/offline-note-taking-app/

## Features

- Add and delete notes
- Works fully offline using IndexedDB
- Background sync to `/api/notes` when back online
- Installable as a PWA
- Cache-first service worker for instant load

## Tech Stack

- Vanilla HTML, CSS, JavaScript
- IndexedDB for local storage
- Service Worker with Background Sync API
- Web App Manifest for PWA installability

## Project Structure

```
Simple_Offline_App/
├── index.html      # App UI
├── app.js          # Client logic, IndexedDB, SW registration
├── sw.js           # Service worker (caching + background sync)
├── style.css       # Styles
├── manifest.json   # PWA manifest
└── icons/
    ├── icon-192.png  # PWA icon (192x192)
    └── icon-512.png  # PWA icon (512x512)
```

## Running Locally

Just serve the files with any static server, e.g.:

```bash
npx serve .
```

Then open http://localhost:3000.

> Note: Service Workers require HTTPS or `localhost` to function.

## Notes

- The `/api/notes` sync endpoint is not included — notes will remain in ⏳ Pending state until a backend is connected.
