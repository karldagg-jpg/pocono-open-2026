import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { roundMoments, tickerMoments, boardRecap, shotsSummary } from "../src/lib/boardRecap.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const POCONO = archive.event;

const COURSE = {
  name: "Test", par: Array(18).fill(4),
  si: Array.from({ length: 18 }, (_, i) => i + 1), slope: 113, rating: 72,
};
const P = (id, name, hcpIndex = 0) => ({ id, name, hcpIndex });
const card = (over = {}) => { const a = Array(18).fill(0); Object.entries(over).forEach(([h, v]) => { a[h] = v; }); return a; };
const ev = (players, scores) => ({
  players, courses: { c1: COURSE }, rounds: { 1: { courseId: "c1", scores } }, games: {},
});

describe("roundMoments", () => {
  const players = [P(1, "Ann"), P(2, "Ben")];

  it("finds nothing on a round of pars", () => {
    expect(roundMoments(ev(players, { 1: card({ 0: 4, 1: 4 }) }), 1)).toEqual([]);
  });

  it("picks up a birdie, an eagle and an ace, and names them apart", () => {
    const m = roundMoments(ev(players, { 1: card({ 0: 3, 1: 2, 2: 1 }) }), 1);
    expect(m.map(x => x.kind)).toEqual(["birdie", "eagle", "hio"]);
    expect(m[2].hole).toBe(3);
  });

  it("reads holes in order so the ticker runs the way the round did", () => {
    const m = roundMoments(ev(players, { 1: card({ 8: 3 }), 2: card({ 2: 3 }) }), 1);
    expect(m.map(x => x.hole)).toEqual([3, 9]);
  });

  it("is gross only — a stroke doesn't make it a birdie", () => {
    const m = roundMoments(ev([P(1, "Cal", 18)], { 1: card({ 0: 4 }) }), 1);
    expect(m).toEqual([]);
  });

  it("copes with a round that has no course yet", () => {
    expect(roundMoments({ players, rounds: { 1: {} }, courses: {} }, 1)).toEqual([]);
    expect(roundMoments(null, 1)).toEqual([]);
  });

  it("finds every achievement on the real round 1", () => {
    const m = roundMoments(POCONO, 1);
    expect(m.length).toBeGreaterThan(0);
    expect(m.every(x => ["birdie", "eagle", "hio"].includes(x.kind))).toBe(true);
    // The Winnings screen shows 13 birdie-pool events in round 1.
    expect(m).toHaveLength(13);
  });
});

describe("tickerMoments", () => {
  const players = [P(1, "Ann"), P(2, "Ben")];

  it("puts the newest first, so the ticker leads with what just happened", () => {
    const t = tickerMoments(ev(players, { 1: card({ 0: 3, 5: 3, 11: 3 }) }), 1);
    expect(t.map(x => x.hole)).toEqual([12, 6, 1]);
  });

  it("floats an ace and an eagle above the birdies whenever they happened", () => {
    const t = tickerMoments(ev(players, { 1: card({ 0: 1, 1: 3, 2: 3, 3: 2 }) }), 1);
    expect(t.slice(0, 2).map(x => x.kind)).toEqual(["eagle", "hio"]);
  });

  it("writes it the way you'd say it", () => {
    const t = tickerMoments(ev(players, { 1: card({ 2: 3 }) }), 1);
    expect(t[0].text).toBe("Ann birdied the 3rd");
    expect(tickerMoments(ev(players, { 1: card({ 0: 1 }) }), 1)[0].text).toBe("Ann ACED the 1st");
    expect(tickerMoments(ev(players, { 1: card({ 11: 2 }) }), 1)[0].text).toBe("Ann eagled the 12th");
  });

  it("gets the awkward ordinals right", () => {
    const t = tickerMoments(ev(players, { 1: card({ 1: 3, 10: 3, 12: 3 }) }), 1);
    expect(t.map(x => x.text.split("the ")[1]).sort()).toEqual(["11th", "13th", "2nd"]);
  });

  it("caps a busy day rather than scrolling forever", () => {
    const busy = card(Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i, 3])));
    expect(tickerMoments(ev(players, { 1: busy, 2: busy }), 1)).toHaveLength(12);
    expect(tickerMoments(ev(players, { 1: busy }), 1, 3)).toHaveLength(3);
  });

  it("never drops an ace to make room for birdies", () => {
    const busy = card(Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i, 3])));
    const aced = { ...busy }; const arr = [...busy]; arr[17] = 1;
    const t = tickerMoments(ev(players, { 1: arr, 2: busy }), 1, 5);
    expect(t.some(x => x.kind === "hio")).toBe(true);
  });

  it("is empty on a quiet round rather than inventing something", () => {
    expect(tickerMoments(ev(players, { 1: card({ 0: 4, 1: 5 }) }), 1)).toEqual([]);
  });
});

describe("boardRecap", () => {
  const players = [P(1, "Ann"), P(2, "Ben"), P(3, "Cal")];

  it("says nothing has started before a card is opened", () => {
    const r = boardRecap(ev(players, {}), 1);
    expect(r.anyStarted).toBe(false);
    expect(r.lowNet).toBeNull();
    expect(r.margin).toBeNull();
  });

  it("names the low round and whether it's finished", () => {
    const done = Array(18).fill(4); const worse = Array(18).fill(5);
    const r = boardRecap(ev(players, { 1: done, 2: worse, 3: worse }), 1);
    expect(r.lowNet.player.name).toBe("Ann");
    expect(r.lowNet.netToPar).toBe(0);
    expect(r.lowNet.complete).toBe(true);
  });

  it("flags a low round that's still out on the course", () => {
    const r = boardRecap(ev(players, { 1: card({ 0: 3, 1: 3 }) }), 1);
    expect(r.lowNet.complete).toBe(false);
    expect(r.lowNet.thru).toBe(2);
  });

  it("counts birdies or better, and shares the chip on a tie", () => {
    const r = boardRecap(ev(players, { 1: card({ 0: 3 }), 2: card({ 1: 3 }), 3: card({ 2: 4 }) }), 1);
    expect(r.mostBirdies.count).toBe(1);
    expect(r.mostBirdies.players.map(p => p.name).sort()).toEqual(["Ann", "Ben"]);
  });

  it("counts an eagle once, not as two birdies", () => {
    const r = boardRecap(ev(players, { 1: card({ 0: 2 }), 2: card({ 1: 3, 2: 3 }) }), 1);
    expect(r.mostBirdies.players.map(p => p.name)).toEqual(["Ben"]);
    expect(r.mostBirdies.count).toBe(2);
  });

  it("leaves the birdie chip empty when nobody has made one", () => {
    expect(boardRecap(ev(players, { 1: card({ 0: 5 }) }), 1).mostBirdies).toBeNull();
  });

  it("measures how tight it is at the top", () => {
    const r = boardRecap(ev(players, {
      1: Array(18).fill(4), 2: card(Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i, i === 0 ? 5 : 4]))), 3: Array(18).fill(6),
    }), 1);
    expect(r.margin.leader.name).toBe("Ann");
    expect(r.margin.chaser.name).toBe("Ben");
    expect(r.margin.shots).toBe(1);
  });

  it("has no margin to report with only one player out", () => {
    expect(boardRecap(ev(players, { 1: card({ 0: 4 }) }), 1).margin).toBeNull();
  });

  it("reads the real round 3 without inventing anything", () => {
    const r = boardRecap(POCONO, 3);
    expect(r.anyStarted).toBe(true);
    expect(r.lowNet.player.name).toBe("Jake");   // Jake won the weekend
    expect(r.margin.shots).toBeGreaterThanOrEqual(0);
    expect(r.mostBirdies.count).toBeGreaterThan(0);
  });
});

describe("shotsSummary", () => {
  it("lists exactly where a player gets a shot", () => {
    const s = shotsSummary(P(1, "Six", 6), COURSE);
    expect(s.courseHcp).toBe(6);
    expect(s.total).toBe(6);
    expect(s.holes.map(h => h.hole)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("doubles up on the hard holes for a high index", () => {
    const s = shotsSummary(P(1, "Hack", 22), COURSE);
    expect(s.total).toBe(22);
    expect(s.holes.find(h => h.hole === 1).strokes).toBe(2);
    expect(s.holes.find(h => h.hole === 10).strokes).toBe(1);
  });

  it("gives a scratch player nothing", () => {
    expect(shotsSummary(P(1, "Ann", 0), COURSE)).toEqual({ courseHcp: 0, holes: [], total: 0 });
  });
});
