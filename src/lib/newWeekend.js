// ── Starting a new weekend ────────────────────────────────────────────────────
// Creating one from scratch meant re-typing the whole field. Most of what a new
// weekend needs is the same as the last one — the same people, the same games,
// the same buy-in — so the sensible default is to carry that and leave behind
// anything that belongs to the weekend just played.
import { splitAcrossRounds } from "./rounds.js";

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
 *
 * Anything set per round is re-shaped to the new weekend's rounds. Carrying
 * 2026's three scats pots into a four-round weekend left round 4 with no pot of
 * its own, so it fell back to an old flat figure and paid out the wrong amount.
 * The scats total is kept and re-shared across the new rounds; a per-round
 * birdie pool switch carries where the round exists and defaults to on.
 */
export function resetGames(games, ids = null) {
  if (!games) return {};
  const out = JSON.parse(JSON.stringify(games));
  if (out.ctp) { out.ctp.results = {}; out.ctp.holes = {}; }
  if (ids && ids.length) {
    const pbr = out.scatts?.potByRound;
    const same = pbr && Object.keys(pbr).map(Number).sort((a, b) => a - b).join() === [...ids].join();
    if (pbr && !same) {
      const total = Object.values(pbr).reduce((t, v) => t + (Number(v) || 0), 0);
      out.scatts.potByRound = splitAcrossRounds(total, ids);
    }
    const bp = out.birdiePool;
    if (bp && typeof bp === "object") {
      const next = { enabled: bp.enabled };
      for (const r of ids) next[r] = bp[r] !== false;
      out.birdiePool = next;
    }
  }
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
        // Blank, not 0. Zero is a scratch golfer, and the readiness check
        // would wave the whole field through as if everyone had an index.
        hcpIndex: resetIndexes ? null : p.hcpIndex,
      }))
    : [];

  const rounds = blankRounds(roundCount);
  const ids = Object.keys(rounds).map(Number);
  return {
    name: name || "New weekend",
    players,
    courses: {},
    rounds,
    pairings: {},
    games: keepGames ? resetGames(src.games, ids) : {},
    // Cards are signed before the money settles. New weekends only — a
    // weekend already played is never held up by a rule it didn't have.
    requireSignOff: true,
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
