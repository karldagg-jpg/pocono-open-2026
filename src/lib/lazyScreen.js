// ── Loading a screen when it's first opened ──────────────────────────────────
// Setup, Courses, Replay and the rest are never opened on the course, so they
// load on first use rather than with the app. If a deploy has replaced the file
// a phone is asking for (the old name no longer exists), reload once to pick
// up the new version instead of showing a blank screen.
import { lazy } from "react";

const FLAG = "pocono:reloadedForUpdate";

export function lazyScreen(load, { storage = globalThis.sessionStorage, reload = () => globalThis.location?.reload() } = {}) {
  return lazy(() => loadWithReload(load, { storage, reload }));
}

export async function loadWithReload(load, { storage, reload }) {
  try {
    const mod = await load();
    try { storage?.removeItem(FLAG); } catch { /* private mode */ }
    return mod;
  } catch (err) {
    let already = false;
    try { already = storage?.getItem(FLAG) === "1"; } catch { /* ignore */ }
    if (!already) {
      try { storage?.setItem(FLAG, "1"); } catch { /* ignore */ }
      reload();
      return new Promise(() => {});        // the page is reloading; never settle
    }
    throw err;                              // reloaded once already — a real failure
  }
}
