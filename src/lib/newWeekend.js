// ── Starting a new weekend ────────────────────────────────────────────────────
// Creating one from scratch meant re-typing the whole field. Most of what a new
// weekend needs is the same as the last one — the same people, the same games,
// the same buy-in — so the sensible default is to carry that and leave behind
// anything that belongs to the weekend just played.

export const CARRIED = ["players", "games", "weekendBuyIn"];
export const NOT_CARRIED = ["rounds", "pairings", "sixies", "courses", "optOuts", "birdieOptOuts"];

/** An empty round for each slot — courses get assigned per venue. */
export function blankRounds(count) {
  const out = {};
  for (let i = 1; i <= Math.max(0, count); i++) out[i] = { courseId: null, scores: {} };
  return out;
}

/**
 * Strip a games block back to its settings, dropping last weekend's results.
 * Pots and which games are on carry; closest-to-pin winners do not.
 */
export function resetGames(games) {
  if (!games) return {};
  const out = JSON.parse(JSON.stringify(games));
  if (out.ctp) { out.ctp.results = {}; out.ctp.holes = {}; }
  return out;
}

/**
 * Build the next weekend from the last one.
 *
 * Courses are deliberately not carried: a new venue means new courses, and they
 * come from the shared library rather than being copied between events.
 */
export function cloneWeekend(source, {
  label,
  roundCount = 3,
  keepPlayers = true,
  keepGames = true,
  resetIndexes = false,
} = {}) {
  const src = source || {};
  const name = (label || "").trim();

  const players = keepPlayers
    ? (src.players || []).map(p => ({
        ...p,
        hcpIndex: resetIndexes ? 0 : p.hcpIndex,
      }))
    : [];

  return {
    name: name || "New weekend",
    players,
    courses: {},
    rounds: blankRounds(roundCount),
    pairings: {},
    games: keepGames ? resetGames(src.games) : {},
    weekendBuyIn: src.weekendBuyIn ?? 100,
  };
}

/** What a clone will and won't bring, for showing before it happens. */
export function describeClone(source, opts = {}) {
  const next = cloneWeekend(source, opts);
  return {
    players: next.players.length,
    rounds: Object.keys(next.rounds).length,
    gamesEnabled: Object.entries(next.games || {})
      .filter(([, g]) => g && typeof g === "object" && g.enabled)
      .map(([k]) => k),
    buyIn: next.weekendBuyIn,
    leavesBehind: NOT_CARRIED.filter(k => {
      const v = (source || {})[k];
      if (!v) return false;
      return Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0;
    }),
  };
}
