// ── What's on this hole ───────────────────────────────────────────────────────
// Standing on a tee, the questions are always the same: who gets a stroke here,
// who's winning the scat, and what is it worth. The scorecard answers none of
// them — it shows what already happened, one number per box.
//
// Scats don't carry. A pushed hole isn't held over; it simply never becomes a
// scat, which means every push makes each remaining scat worth MORE, since the
// pot is divided by however many scats the round ends up producing. That's the
// bit players get wrong, so it's stated rather than implied.
import { getEffectiveHcp, strokesOnHole, calcScatts } from "./golfLogic.js";

export const BIRDIE_RATES = { birdie: 1, eagle: 5, hio: 10 };

/** Everyone's stroke allowance on one hole — the "do I get a shot here" answer. */
export function strokesOnHoleFor(players, course, holeIdx, useIndex = true) {
  const si = course?.si?.[holeIdx];
  return players.map((p) => {
    const chcp = getEffectiveHcp(p, course, useIndex);
    return { player: p, courseHcp: chcp, strokes: si == null ? 0 : strokesOnHole(chcp, si) };
  });
}

/**
 * The live state of one hole: every player's gross and net, who's leading it,
 * and whether it's currently heading for a push.
 *
 * Mirrors calcScatts' tiering exactly — gross achievements (HIO, eagle, birdie)
 * beat any net score, and only an outright best wins. `settled` says whether
 * everyone in the group has holed out, because a leader with cards outstanding
 * isn't a winner yet.
 */
export function holeState(players, course, scores, holeIdx, useIndex = true) {
  const par = course?.par?.[holeIdx] ?? 4;
  const si = course?.si?.[holeIdx] ?? holeIdx + 1;

  const rows = players.map((p) => {
    const gross = (scores?.[p.id] || [])[holeIdx] || 0;
    const chcp = getEffectiveHcp(p, course, useIndex);
    const strokes = strokesOnHole(chcp, si);
    if (!gross) return { player: p, gross: 0, strokes, net: 0, netToPar: 0, grossToPar: 0, tier: 99, posted: false };
    const net = gross - strokes;
    const grossToPar = gross - par;
    let tier;
    if (gross === 1) tier = 0;
    else if (grossToPar <= -2) tier = 1;
    else if (grossToPar === -1) tier = 2;
    else tier = 3;
    return { player: p, gross, strokes, net, netToPar: net - par, grossToPar, tier, posted: true };
  });

  const posted = rows.filter((r) => r.posted);
  const settled = posted.length === players.length && players.length > 0;

  let leaders = [], push = false, type = null;
  if (posted.length) {
    const bestTier = Math.min(...posted.map((r) => r.tier));
    const candidates = posted.filter((r) => r.tier === bestTier);
    if (bestTier < 3) {
      const bestGross = Math.min(...candidates.map((r) => r.gross));
      leaders = candidates.filter((r) => r.gross === bestGross);
      type = bestTier === 0 ? "hio" : bestTier === 1 ? "eagle" : "birdie";
    } else {
      // A net par wins nothing: the hole needs a net birdie or better.
      const netBirdies = posted.filter((r) => r.netToPar <= -1);
      if (netBirdies.length) {
        const best = Math.min(...netBirdies.map((r) => r.netToPar));
        leaders = netBirdies.filter((r) => r.netToPar === best);
        type = "net";
      }
    }
    push = leaders.length !== 1;
  } else {
    push = true;
  }

  return {
    hole: holeIdx + 1, par, si, rows, posted: posted.length, settled,
    leaders, type: leaders.length === 1 ? type : null, push,
    // Only call it won once every card is in.
    winner: settled && leaders.length === 1 ? leaders[0] : null,
  };
}

/**
 * What a scat is worth right now, and what each push has done to that.
 *
 * The true value isn't known until the round ends — it's the pot divided by the
 * final scat count. This reports the value if the round stopped here, which is
 * the only honest live number, and says how many holes are still out.
 */
export function scattWorth(roundScores, course, players, pot, useIndex = true) {
  const n = Math.max(players.length, 1);
  const { totalScatts, holeResults } = calcScatts(roundScores, course, players, pot / n, useIndex);

  // A hole counts as played once anyone has posted on it.
  const played = [];
  for (let h = 0; h < 18; h++) {
    if (players.some((p) => (roundScores?.[p.id] || [])[h])) played.push(h);
  }
  const pushes = played.filter((h) => holeResults[h]?.push).length;

  return {
    pot,
    scatts: totalScatts,
    pushes,
    holesPlayed: played.length,
    // Undecided until at least one scat exists — dividing by zero isn't "free".
    valueNow: totalScatts > 0 ? pot / totalScatts : 0,
    // Every further scat splits the same pot more ways, so the number on screen
    // only ever falls from here. Worth seeing before someone counts their money.
    valueIfOneMoreScatt: pot / (totalScatts + 1),
  };
}

/** What this hole is about to cost or pay in the birdie pool. */
export function birdiePoolHole(players, course, scores, holeIdx) {
  const par = course?.par?.[holeIdx] ?? 4;
  const events = [];
  for (const p of players) {
    const gross = (scores?.[p.id] || [])[holeIdx] || 0;
    if (!gross) continue;
    const toPar = gross - par;
    let type;
    if (gross === 1) type = "hio";
    else if (toPar <= -2) type = "eagle";
    else if (toPar === -1) type = "birdie";
    else continue;
    const rate = BIRDIE_RATES[type];
    events.push({ player: p, type, rate, collects: rate * (players.length - 1) });
  }
  return { events, owedEach: events.reduce((s, e) => s + e.rate, 0) };
}

/** A group's position against the field, for the tee-box glance. */
export function groupStanding(groupIds, fieldRows) {
  const inGroup = fieldRows.filter((r) => groupIds.includes(r.player?.id ?? r.id));
  return inGroup.map((r) => ({ ...r, position: fieldRows.indexOf(r) + 1 }));
}
