// ── The strip across the top of the board ─────────────────────────────────────
// A leaderboard tells you the order. It doesn't tell you what's been happening
// — who's gone low, who's holing putts, whether anything is close. That's the
// part people actually talk about, so it goes above the table, not in it.
//
// Everything here reads only what's on the cards. Nothing is estimated, and a
// quiet round honestly produces an empty strip rather than invented drama.
import { liveRound } from "./liveBoard.js";
import { getEffectiveHcp, strokesOnHole } from "./golfLogic.js";

/** Every gross achievement on a round's cards, in the order they were made. */
export function roundMoments(event, roundId) {
  const round = event?.rounds?.[roundId];
  const course = event?.courses?.[round?.courseId];
  if (!round || !course) return [];

  const out = [];
  for (let h = 0; h < 18; h++) {
    const par = course.par[h];
    for (const p of event.players || []) {
      const gross = ((round.scores || {})[p.id] || [])[h] || 0;
      if (!gross) continue;
      const toPar = gross - par;
      let kind = null;
      if (gross === 1) kind = "hio";
      else if (toPar <= -2) kind = "eagle";
      else if (toPar === -1) kind = "birdie";
      if (!kind) continue;
      out.push({ kind, player: p, hole: h + 1, gross, par });
    }
  }
  return out;
}

const MOMENT_TEXT = {
  hio: (m) => `${m.player.name} ACED the ${ordinal(m.hole)}`,
  eagle: (m) => `${m.player.name} eagled the ${ordinal(m.hole)}`,
  birdie: (m) => `${m.player.name} birdied the ${ordinal(m.hole)}`,
};

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Moments worth scrolling, newest first.
 *
 * Aces and eagles always make it. Birdies only fill the remaining space —
 * on a good day there are forty of them and they stop being news.
 */
export function tickerMoments(event, roundId, limit = 12) {
  const all = roundMoments(event, roundId);
  const big = all.filter((m) => m.kind !== "birdie").reverse();
  const birdies = all.filter((m) => m.kind === "birdie").reverse();
  return [...big, ...birdies].slice(0, limit).map((m) => ({
    ...m, text: MOMENT_TEXT[m.kind](m),
  }));
}

/**
 * The chips: low round, most birdies, and how tight it is at the top.
 *
 * Each one is null when it can't be answered yet, so the board can leave a
 * chip out rather than print a dash and pretend.
 */
export function boardRecap(event, roundId) {
  const live = liveRound(event, roundId);
  if (!live) return { lowNet: null, mostBirdies: null, margin: null, anyStarted: false };

  const started = live.rows.filter((r) => r.started);
  if (!started.length) return { lowNet: null, mostBirdies: null, margin: null, anyStarted: false };

  // Low net so far. Only complete rounds can claim a "low round" outright;
  // mid-round it's flagged as still out there.
  const best = started.reduce((a, b) => (b.netToPar < a.netToPar ? b : a));
  const lowNet = {
    player: best.player,
    netToPar: best.netToPar,
    gross: best.gross,
    thru: best.thru,
    complete: best.complete,
  };

  const moments = roundMoments(event, roundId);
  // Birdies or better — an eagle counts once, not twice; it gets its own
  // billing in the ticker.
  const counts = new Map();
  for (const m of moments) counts.set(m.player.id, (counts.get(m.player.id) || 0) + 1);
  let mostBirdies = null;
  if (counts.size) {
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const n = top[0][1];
    const tied = top.filter(([, c]) => c === n).map(([id]) => event.players.find((p) => p.id === id));
    mostBirdies = { players: tied, count: n };
  }

  // How close the top is — the number that decides whether anyone's watching.
  let margin = null;
  if (started.length >= 2) {
    const sorted = [...started].sort((a, b) => a.netToPar - b.netToPar);
    margin = { leader: sorted[0].player, chaser: sorted[1].player, shots: sorted[1].netToPar - sorted[0].netToPar };
  }

  return { lowNet, mostBirdies, margin, anyStarted: true, moments: moments.length };
}

/** Where a player is getting shots, for the "plays off" line. */
export function shotsSummary(player, course, useIndex = true) {
  const chcp = getEffectiveHcp(player, course, useIndex);
  const holes = [];
  for (let h = 0; h < 18; h++) {
    const s = strokesOnHole(chcp, course.si[h]);
    if (s > 0) holes.push({ hole: h + 1, strokes: s });
  }
  return { courseHcp: chcp, holes, total: holes.reduce((t, x) => t + x.strokes, 0) };
}
