// ── Which rounds a weekend has ────────────────────────────────────────────────
// The app was written for three rounds and said so in about fifteen places.
// New Weekend lets you choose anywhere from one to six, so a fourth round got
// no course picker, no scoring tab and no share of the money. Every screen and
// calculation now asks here instead.

// A weekend with no rounds yet (a brand-new doc) still shows the classic three,
// so nothing that ran before this change looks different.
export const DEFAULT_ROUNDS = [1, 2, 3];

/** The weekend's round numbers, in playing order. */
export function roundIds(event) {
  const ids = Object.keys(event?.rounds || {})
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
  return ids.length ? ids : [...DEFAULT_ROUNDS];
}

export function roundCount(event) {
  return roundIds(event).length;
}

/** Last round of the weekend — the one paired by standings. */
export function isFinalRound(event, roundId) {
  const ids = roundIds(event);
  return Number(roundId) === ids[ids.length - 1];
}

/**
 * Share a whole-dollar amount across the rounds, so the parts add back up to
 * exactly the total. Leftover dollars go to the first round, or the last.
 */
export function splitAcrossRounds(total, ids, { remainderTo = "first" } = {}) {
  const t = Math.max(0, Math.round(Number(total) || 0));
  const list = [...ids];
  if (!list.length) return {};
  const each = Math.floor(t / list.length);
  const out = Object.fromEntries(list.map((id) => [id, each]));
  const extra = t - each * list.length;
  out[remainderTo === "last" ? list[list.length - 1] : list[0]] += extra;
  return out;
}

/** The same value for every round — e.g. every round's birdie pool switched on. */
export function perRound(ids, value) {
  return Object.fromEntries([...ids].map((id) => [id, value]));
}
