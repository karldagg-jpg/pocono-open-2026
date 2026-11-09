// ── Saves that haven't reached the server yet ────────────────────────────────
// With no signal, Firestore keeps a score on the phone and sends it later — but
// the only sign of that was a console message nobody sees. A scorekeeper on a
// back nine with no bars had no idea whether eleven holes were safe.
//
// A Firestore write's promise settles only once the server has it, so counting
// the unsettled ones is an honest count of what's still on the phone. A save
// normally settles in a fraction of a second; `waiting` ignores anything newer
// than the grace period so the marker doesn't flicker on every tap.

export function createPendingWrites() {
  let next = 1;
  const open = new Map();            // id → { kind, since }
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());

  return {
    /** Follow a save until the server has it. Returns the same promise. */
    track(promise, kind = "change", now = Date.now) {
      const id = next++;
      open.set(id, { kind, since: now() });
      emit();
      const done = () => { open.delete(id); emit(); };
      Promise.resolve(promise).then(done, done);
      return promise;
    },
    /** Saves older than `graceMs`, by kind: { total, score, change }. */
    waiting(nowMs = Date.now(), graceMs = 3000) {
      const out = { total: 0, score: 0, change: 0 };
      for (const { kind, since } of open.values()) {
        if (nowMs - since < graceMs) continue;
        out.total++;
        out[kind === "score" ? "score" : "change"]++;
      }
      return out;
    },
    size() { return open.size; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/** What the marker says. Null when there's nothing to say. */
export function waitingLabel(w) {
  if (!w || !w.total) return null;
  if (w.score && !w.change) return `${w.score} score${w.score === 1 ? "" : "s"} waiting to send`;
  if (!w.score) return `${w.change} change${w.change === 1 ? "" : "s"} waiting to send`;
  return `${w.total} changes waiting to send`;
}

// The app's one tracker.
export const pendingWrites = createPendingWrites();
