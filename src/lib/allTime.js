// ── The all-time record ──────────────────────────────────────────────────────
// Every weekend is kept, so the trip has a history: who's won, who's up over
// the years, the best rounds, and how any two players stack up when they've
// played the same round. Players are matched across weekends by id (New
// Weekend carries them over), falling back to the name.
import { calcLeaderboard, getEffectiveHcp } from "./golfLogic.js";
import { settleWeekend } from "./settlement.js";
import { playersAtRound } from "./handicapLock.js";
import { coursesFor } from "./courses.js";
import { roundIds, roundCount } from "./rounds.js";
import { weekendTime } from "./courseLibrary.js";

const full = (c) => (c || []).filter((n) => Number(n) > 0).length === 18;
const sum = (a) => (a || []).reduce((t, v) => t + (Number(v) || 0), 0);

/** Weekends with at least one full card, oldest first, each with its courses resolved. */
export function playedWeekends(weekends, library = {}) {
  return (weekends || [])
    .map((w) => ({ ...w, event: { ...(w.event || {}), courses: coursesFor(w.event, library) } }))
    .filter((w) => Object.values(w.event.rounds || {}).some((r) => Object.values(r?.scores || {}).some(full)))
    .sort((a, b) => weekendTime(a.id, a.event) - weekendTime(b.id, b.event));
}

/** Every full round played, with gross, net and birdie counts. */
export function allRounds(weekends) {
  const out = [];
  for (const w of weekends) {
    const ev = w.event;
    const useIndex = ev.games?.useIndexHcp !== false;
    for (const rid of roundIds(ev)) {
      const r = ev.rounds?.[rid];
      const course = ev.courses?.[r?.courseId];
      if (!course) continue;
      for (const p of playersAtRound(ev, rid)) {
        const card = r.scores?.[p.id];
        if (!full(card)) continue;
        const gross = sum(card);
        let birdies = 0, eagles = 0;
        card.forEach((s, h) => {
          const d = Number(s) - (course.par?.[h] || 4);
          if (Number(s) === 1 || d <= -2) eagles++;
          else if (d === -1) birdies++;
        });
        out.push({
          weekendId: w.id, label: w.label || w.id, roundId: rid,
          playerId: p.id, name: p.name,
          gross, net: gross - getEffectiveHcp(p, course, useIndex), birdies, eagles,
          course: course.name,
        });
      }
    }
  }
  return out;
}

/** Who won each weekend: lowest net total among those who played every round. Ties share it. */
export function weekendWinners(w) {
  const n = roundCount(w.event);
  const board = calcLeaderboard(w.event).filter((r) => r.roundsPlayed === n && r.total != null);
  if (!board.length) return { names: [], ids: [], total: null };
  const best = board[0].total;
  const top = board.filter((r) => r.total === best);
  return { names: top.map((r) => r.player.name), ids: top.map((r) => r.player.id), total: best };
}

const keyOf = (p) => String(p.id ?? p.name);

/**
 * The career table, money first.
 * → [{ key, name, weekends, rounds, net, wins, birdies, eagles, bestGross, bestNet }]
 */
export function careerTable(weekends) {
  const people = new Map();
  const get = (p) => {
    const k = keyOf(p);
    if (!people.has(k)) people.set(k, { key: k, name: p.name, weekends: 0, rounds: 0, net: 0, wins: 0, birdies: 0, eagles: 0, bestGross: null, bestNet: null });
    const row = people.get(k);
    row.name = p.name;                     // the latest weekend's spelling wins
    return row;
  };

  for (const w of weekends) {
    const s = settleWeekend(w.event);
    const played = new Set();
    for (const r of Object.values(w.event.rounds || {})) {
      for (const [pid, card] of Object.entries(r?.scores || {})) if (full(card)) played.add(String(pid));
    }
    for (const row of s.rows) {
      if (!played.has(String(row.player.id))) continue;   // on the roster but never played
      const c = get(row.player);
      c.weekends++;
      c.net += row.net;
    }
    for (const id of weekendWinners(w).ids) {
      const p = (w.event.players || []).find((x) => x.id === id);
      if (p) get(p).wins++;
    }
  }

  for (const r of allRounds(weekends)) {
    const c = get({ id: r.playerId, name: r.name });
    c.rounds++;
    c.birdies += r.birdies;
    c.eagles += r.eagles;
    const where = { score: r.gross, label: r.label, roundId: r.roundId, course: r.course };
    if (!c.bestGross || r.gross < c.bestGross.score) c.bestGross = where;
    if (!c.bestNet || r.net < c.bestNet.score) c.bestNet = { ...where, score: r.net };
  }

  return [...people.values()].sort((a, b) => b.net - a.net || b.wins - a.wins || a.name.localeCompare(b.name));
}

/**
 * Two players, every round they both finished: who had the better net.
 * → { rounds, aWins, bWins, halved, strokes }  (strokes: a's net minus b's, summed)
 */
export function headToHead(weekends, aKey, bKey) {
  const out = { rounds: 0, aWins: 0, bWins: 0, halved: 0, strokes: 0, list: [] };
  const byRound = new Map();
  for (const r of allRounds(weekends)) {
    const k = `${r.weekendId}|${r.roundId}`;
    if (!byRound.has(k)) byRound.set(k, new Map());
    byRound.get(k).set(String(r.playerId), r);
  }
  for (const m of byRound.values()) {
    const a = m.get(String(aKey)), b = m.get(String(bKey));
    if (!a || !b) continue;
    out.rounds++;
    out.strokes += a.net - b.net;
    if (a.net < b.net) out.aWins++;
    else if (b.net < a.net) out.bWins++;
    else out.halved++;
    out.list.push({ label: a.label, roundId: a.roundId, a: a.net, b: b.net });
  }
  return out;
}
