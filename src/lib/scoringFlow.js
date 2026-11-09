// ── Moving through a round ───────────────────────────────────────────────────
// Entering a hole used to end with a scroll back up to the hole grid to tap the
// next number, and opening the screen always started on hole 1 even halfway
// round. These decide where the scorer should be, so the screen can put them
// there.

const has = (scores, id, h) => Number((scores?.[id] || [])[h]) > 0;

/** Every player in the group has a score on this hole. */
export function holeComplete(groupIds, scores, hole) {
  return groupIds.length > 0 && groupIds.every((id) => has(scores, id, hole));
}

/**
 * Where to pick up: the first hole the group hasn't finished. A round played
 * all the way through comes back to the 18th, not the 1st.
 */
export function firstOpenHole(groupIds, scores) {
  for (let h = 0; h < 18; h++) if (!holeComplete(groupIds, scores, h)) return h;
  return 17;
}

/**
 * What to do about moving on, after a score changes on `hole`.
 *   "schedule" — the hole has just been finished (or a finished hole was
 *                adjusted while a move was waiting): move on shortly
 *   "cancel"   — a move was waiting but the hole isn't finished any more
 *   "none"     — leave the scorer where they are
 * A finished hole that's changed later, with nothing waiting, stays put — that
 * is someone fixing a score, and jumping away from them would be infuriating.
 */
export function autoAdvanceAction(groupIds, before, after, hole, pending = false) {
  const done = holeComplete(groupIds, after, hole);
  if (!done || hole >= 17) return pending ? "cancel" : "none";
  if (!holeComplete(groupIds, before, hole)) return "schedule";
  return pending ? "schedule" : "none";
}

/** "8 of 18 holes" style progress for the group. */
export function holesDone(groupIds, scores) {
  let n = 0;
  for (let h = 0; h < 18; h++) if (holeComplete(groupIds, scores, h)) n++;
  return n;
}
