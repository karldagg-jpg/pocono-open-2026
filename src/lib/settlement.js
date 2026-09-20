// ── Settling up ───────────────────────────────────────────────────────────────
// calcWinnings answers "what did each player win", which is not the question at
// the end of a weekend. Someone who won $14 out of a $100 buy-in is down $86,
// and a screen that shows +$14 starts an argument.
//
// This nets winnings against what each player actually staked, and reports the
// reconciliation rather than hiding it: if the pots don't add up to the money
// collected, that gap is shown instead of being quietly absorbed.
import { calcWinnings, calcBirdiePool, gamblingPlayers, birdiePoolPlayers } from "./golfLogic.js";

/** Total of every configured pot, which is what the buy-ins are meant to fund. */
export function totalPots(event) {
  const g = event?.games || {};
  const scatts = g.scatts?.potByRound
    ? Object.values(g.scatts.potByRound).reduce((s, v) => s + (Number(v) || 0), 0)
    : Number(g.scatts?.pot) || 0;
  return {
    scatts,
    lowNet: Number(g.lowNet?.pot) || 0,
    ctp: Number(g.ctp?.pot) || 0,
    hio: Number(g.hio?.pot) || 0,
    get total() { return this.scatts + this.lowNet + this.ctp + this.hio; },
  };
}

/** Opt-out ids that no longer match a player — stale entries worth surfacing. */
export function staleOptOuts(event) {
  const ids = new Set((event?.players || []).map(p => p.id));
  const all = [...(event?.optOuts || []), ...(event?.birdieOptOuts || [])];
  return [...new Set(all.filter(id => !ids.has(id)))];
}

/**
 * Net position for every player.
 *
 * staked  — the weekend buy-in, for anyone not opted out
 * won     — payouts from the pots, plus the birdie pool's own net balance
 * net     — won minus staked; this is the number people settle on
 *
 * The birdie pool is handled separately because it already nets between
 * players rather than paying out of a central pot.
 */
export function settleWeekend(event) {
  const ev = event || {};
  const players = ev.players || [];
  const inPot = new Set(gamblingPlayers(ev).map(p => p.id));
  const inBirdie = new Set(birdiePoolPlayers(ev).map(p => p.id));
  const buyIn = Number(ev.weekendBuyIn ?? ev.buyIn ?? 0) || 0;

  const winnings = calcWinnings(ev);

  // Birdie pool nets across rounds; absent or disabled it contributes nothing.
  // The config is either the legacy literal `true` or an object whose rounds can
  // be switched off individually — same shape WinningsScreen reads.
  const birdieNet = {};
  const bp = ev.games?.birdiePool;
  const birdieOn = bp === true || (bp && typeof bp === "object" && bp.enabled !== false);
  if (birdieOn) {
    for (const rNum of Object.keys(ev.rounds || {})) {
      if (bp !== true && bp[rNum] === false) continue;
      const course = (ev.courses || {})[ev.rounds[rNum]?.courseId];
      if (!course) continue;
      const r = calcBirdiePool(ev.rounds[rNum]?.scores || {}, course, birdiePoolPlayers(ev));
      for (const [pid, v] of Object.entries(r?.netBalance || {})) {
        birdieNet[pid] = (birdieNet[pid] || 0) + (Number(v) || 0);
      }
    }
  }

  const rows = players.map(p => {
    const w = winnings[p.id] || { scatts: 0, lowNet: 0, ctp: 0, hio: 0, total: 0 };
    const birdie = Number(birdieNet[p.id]) || 0;
    const staked = inPot.has(p.id) ? buyIn : 0;
    const won = (w.total || 0) + birdie;
    return {
      player: p,
      playing: inPot.has(p.id),
      inBirdiePool: inBirdie.has(p.id),
      staked,
      scatts: w.scatts || 0,
      lowNet: w.lowNet || 0,
      ctp: w.ctp || 0,
      hio: w.hio || 0,
      birdie,
      won,
      net: won - staked,
    };
  }).sort((a, b) => b.net - a.net);

  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const pots = totalPots(ev);
  const collected = sum("staked");
  const paidOut = rows.reduce((s, r) => s + r.scatts + r.lowNet + r.ctp + r.hio, 0);

  return {
    rows,
    buyIn,
    pots,
    totals: {
      collected,
      pots: pots.total,
      paidOut,
      net: sum("net"),
      // Money taken that no pot accounts for — usually food, tips or a pot not
      // yet configured. Shown rather than absorbed so it can be explained.
      unallocated: collected - pots.total,
      // Payouts drifting from the pot total, normally rounding on scat values.
      payoutDrift: paidOut - pots.total,
    },
    staleOptOuts: staleOptOuts(ev),
  };
}

/** Who pays whom, greedily — fewest transfers that clear every balance. */
export function settlementTransfers(rows, round = Math.round) {
  const owed = rows.filter(r => r.net > 0).map(r => ({ id: r.player.id, name: r.player.name, amt: r.net }));
  const owes = rows.filter(r => r.net < 0).map(r => ({ id: r.player.id, name: r.player.name, amt: -r.net }));
  owed.sort((a, b) => b.amt - a.amt);
  owes.sort((a, b) => b.amt - a.amt);

  const out = [];
  let i = 0, j = 0;
  while (i < owes.length && j < owed.length) {
    const pay = Math.min(owes[i].amt, owed[j].amt);
    if (pay > 0) out.push({ from: owes[i].name, fromId: owes[i].id, to: owed[j].name, toId: owed[j].id, amount: round(pay) });
    owes[i].amt -= pay;
    owed[j].amt -= pay;
    if (owes[i].amt <= 0.0001) i++;
    if (owed[j].amt <= 0.0001) j++;
  }
  return out;
}
