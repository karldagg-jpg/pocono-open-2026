/* Service worker — the build fills in VERSION and ASSETS (see vite.config.js).
 *
 * Why it exists: with no signal, reloading the page gave a blank screen. The
 * scores were safe on the phone, but the app itself wasn't. This keeps every
 * file the app needs on the phone, so it opens anywhere on the course.
 *
 *   The page itself  — network first (so a new version shows up), falling back
 *                      to the saved copy after a few seconds or with no signal.
 *   Everything else  — from the phone first; file names change with every
 *                      version, so a saved file is never out of date.
 *
 * A new version waits until the app says so (the "Update ready" banner), so
 * nobody's screen reloads under them mid-round.
 */
const VERSION = "__VERSION__";
const ASSETS = __ASSETS__;
const CACHE = `pocono-${VERSION}`;
const NAV_TIMEOUT_MS = 3500;

const scope = () => new URL(self.registration.scope).pathname;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([scope(), ...ASSETS.map((a) => scope() + a)])),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pocono-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function pageFirstFromNetwork(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(request), NAV_TIMEOUT_MS);
    if (res.ok) cache.put(scope(), res.clone());
    return res;
  } catch {
    return (await cache.match(scope())) || Response.error();
  }
}

async function fileFromPhoneFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Only the app's own files. Firestore keeps its own offline copy of the data.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scope())) return;
  event.respondWith(req.mode === "navigate" ? pageFirstFromNetwork(req) : fileFromPhoneFirst(req));
});
