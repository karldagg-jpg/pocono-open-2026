// ── Keeping the app on the phone ─────────────────────────────────────────────
// Registers the service worker (production only) and tells the app when a new
// version has arrived. The new version waits for a tap on "Update", so nobody's
// screen reloads under them in the middle of a hole.

const listeners = new Set();
let waiting = null;

function announce(worker) {
  waiting = worker;
  listeners.forEach((fn) => fn(worker));
}

/** Call fn(worker) when an update is ready; returns an unsubscribe. */
export function onUpdateReady(fn) {
  listeners.add(fn);
  if (waiting) fn(waiting);
  return () => listeners.delete(fn);
}

/** Switch to the waiting version, and reload once it has taken over. */
export function applyUpdate(worker = waiting, nav = globalThis.navigator, loc = globalThis.location) {
  if (!worker) return false;
  let reloaded = false;
  nav?.serviceWorker?.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    loc?.reload();
  });
  worker.postMessage("SKIP_WAITING");
  return true;
}

/** Watch a registration for a new version finishing its install. */
export function watchRegistration(reg, nav = globalThis.navigator) {
  // Only an update counts — the very first install has nothing to replace.
  const hasController = () => !!nav?.serviceWorker?.controller;
  if (reg.waiting && hasController()) announce(reg.waiting);
  reg.addEventListener("updatefound", () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener("statechange", () => {
      if (w.state === "installed" && hasController()) announce(w);
    });
  });
}

export function registerServiceWorker({ base, prod, nav = globalThis.navigator, win = globalThis.window } = {}) {
  if (!prod || !nav || !("serviceWorker" in nav)) return false;
  const go = () => nav.serviceWorker.register(`${base}sw.js`, { scope: base })
    .then((reg) => {
      watchRegistration(reg, nav);
      // Look for a new version whenever the app comes back to the foreground.
      win?.document?.addEventListener?.("visibilitychange", () => {
        if (win.document.visibilityState === "visible") reg.update().catch(() => {});
      });
    })
    .catch(() => { /* no offline copy this time — the app still works online */ });
  if (win?.document?.readyState === "complete") go();
  else win?.addEventListener?.("load", go, { once: true });
  return true;
}

// For tests.
export function _reset() { waiting = null; listeners.clear(); }
