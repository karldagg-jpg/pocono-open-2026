// ── Live scoring ──────────────────────────────────────────────────────────────
// calcLeaderboard only counts a round once all 18 holes are in, so mid-round
// there is nothing to show. These functions score a round in progress.
//
// The key decision is how much of a player's handicap applies when they're only
// part way round. Allocating it proportionally (hcp * thru/18) is easy but wrong:
// strokes fall on specific holes, so a player who has already played their
// stroke holes has used more of their handicap than the clock suggests. We count
// the strokes that actually land on the holes played, which is what a scorecard
// does and what the finished round will agree with.
import { strokesOnHole, totalPar, getEffectiveHcp } from "./golfLogic";

/** Holes a player has a score on — the furthest hole reached, not the count. */
export function holesThrough(scores) {
  if (!Array.isArray(scores)) return 0;
  let thru = 0;
  for (let i = 0; i < scores.length; i++) if ((scores[i] || 0) > 0) thru = i + 1;
  return thru;
}

/** Strokes this player receives over the first `thru` holes of the course. */
export function strokesThrough(courseHcp, course, thru) {
  let n = 0;
  for (let i = 0; i < thru; i++) n += strokesOnHole(courseHcp, course.si[i]);
  return n;
}

/** Par for the first `thru` holes. */
export function parThrough(course, thru) {
  let p = 0;
  for (let i = 0; i < thru; i++) p += course.par[i] || 0;
  return p;
}

/**
 * One player's state in a round that may be in progress.
 * netToPar is the number a leaderboard shows: net strokes relative to the par
 * of the holes actually played. Even par reads 0, under par negative.
 */
export function playerRoundState(player, course, scores, useIndex = true) {
  const thru = holesThrough(scores);
  const courseHcp = getEffectiveHcp(player, course, useIndex);
  if (!thru) {
    return { player, thru: 0, gross: 0, strokes: 0, net: 0, toPar: 0, netToPar: 0, started: false, complete: false };
  }
  let gross = 0;
  for (let i = 0; i < thru; i++) gross += scores[i] || 0;
  const strokes = strokesThrough(courseHcp, course, thru);
  const par = parThrough(course, thru);
  return {
    player,
    thru,
    gross,
    strokes,
    courseHcp,
    net: gross - strokes,
    toPar: gross - par,
    netToPar: gross - strokes - par,
    started: true,
    complete: thru === course.par.length,
  };
}

/** Dense ranking: ties share a position, the next distinct score follows on. */
export function rankByNetToPar(states) {
  const sorted = [...states].sort((a, b) => {
    if (a.started !== b.started) return a.started ? -1 : 1; // players yet to tee off go last
    if (a.netToPar !== b.netToPar) return a.netToPar - b.netToPar;
    return b.thru - a.thru; // level scores: further round sits higher
  });
  let pos = 0, lastScore = null, lastStarted = null;
  return sorted.map((s, i) => {
    const sameAsPrev = s.started === lastStarted && s.netToPar === lastScore && s.started;
    if (!sameAsPrev) pos = i + 1;
    lastScore = s.netToPar; lastStarted = s.started;
    return { ...s, position: s.started ? pos : null, tied: false };
  }).map((s, i, arr) => ({
    ...s,
    tied: s.started && arr.filter(x => x.position === s.position).length > 1,
  }));
}

/** Live board for a single round. */
export function liveRound(event, roundId) {
  const { players = [], courses = {}, rounds = {}, games = {} } = event || {};
  const round = rounds?.[roundId];
  if (!round) return null;
  const course = courses[round.courseId];
  if (!course) return null;
  const useIndex = games?.useIndexHcp !== false;
  const states = players.map(p =>
    playerRoundState(p, course, (round.scores || {})[p.id] || [], useIndex)
  );
  const started = states.filter(s => s.started);
  return {
    roundId,
    course,
    rows: rankByNetToPar(states),
    playersStarted: started.length,
    playersComplete: states.filter(s => s.complete).length,
    anyInProgress: started.some(s => !s.complete),
  };
}

/**
 * Weekend board: every round summed, including one in progress.
 * A player's total is the sum of their netToPar across rounds they've started,
 * so a leader mid-round-three is compared on the same basis as everyone else.
 */
export function liveWeekend(event) {
  const { players = [], rounds = {} } = event || {};
  const ids = Object.keys(rounds).sort((a, b) => Number(a) - Number(b));
  const perRound = {};
  for (const id of ids) perRound[id] = liveRound(event, id);

  const rows = players.map(p => {
    const byRound = ids.map(id => {
      const lb = perRound[id];
      if (!lb) return null;
      const r = lb.rows.find(x => x.player.id === p.id);
      return r && r.started ? r : null;
    });
    const played = byRound.filter(Boolean);
    return {
      player: p,
      byRound,
      roundsStarted: played.length,
      netToPar: played.reduce((s, r) => s + r.netToPar, 0),
      gross: played.reduce((s, r) => s + r.gross, 0),
      thru: played.reduce((s, r) => s + r.thru, 0),
      started: played.length > 0,
      complete: played.length === ids.length && played.every(r => r.complete),
    };
  });
  return { roundIds: ids, perRound, rows: rankByNetToPar(rows) };
}

/** Where each player sits now versus an earlier snapshot — for movement arrows. */
export function positionDelta(previousRows, currentRows) {
  const before = {};
  for (const r of previousRows || []) if (r.position) before[r.player.id] = r.position;
  const out = {};
  for (const r of currentRows || []) {
    const was = before[r.player.id];
    out[r.player.id] = was && r.position ? was - r.position : 0;
  }
  return out;
}
