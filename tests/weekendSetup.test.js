import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  weekendReadiness, potBalance, suggestPots, groupPlan,
  playersWithoutIndex, roundsWithoutCourse, MISSING, WARN, OK,
} from "../src/lib/weekendSetup.js";
import { cloneWeekend } from "../src/lib/newWeekend.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const POCONO = archive.event;
const LIBRARY = archive.library;

const COURSE = { name: "Pinehurst No. 2", par: Array(18).fill(4), si: Array.from({ length: 18 }, (_, i) => i + 1), slope: 138, rating: 75.1 };
const P = (id, name, hcpIndex = 10) => ({ id, name, hcpIndex });
const field = (n) => Array.from({ length: n }, (_, i) => P(i + 1, `P${i + 1}`, 10 + i));

const weekend = (over = {}) => ({
  name: "Pinehurst 2027",
  players: field(16),
  courses: { c1: COURSE },
  rounds: { 1: { courseId: "c1", scores: {} }, 2: { courseId: "c1", scores: {} }, 3: { courseId: "c1", scores: {} } },
  pairings: {},
  weekendBuyIn: 100,
  games: { scatts: { enabled: true, pot: 700 }, lowNet: { enabled: true, pot: 700 }, hio: { enabled: true, pot: 200 }, ctp: { enabled: true, pot: 0 } },
  ...over,
});

describe("playersWithoutIndex", () => {
  it("is empty when everyone has one", () => {
    expect(playersWithoutIndex(weekend())).toEqual([]);
  });

  it("catches a blank, a null and a non-number", () => {
    const e = weekend({ players: [P(1, "A", null), P(2, "B", ""), P(3, "C", "abc"), P(4, "D", 12)] });
    expect(playersWithoutIndex(e).map(p => p.name)).toEqual(["A", "B", "C"]);
  });

  it("treats a scratch player as having an index", () => {
    expect(playersWithoutIndex(weekend({ players: [P(1, "Scratch", 0)] }))).toEqual([]);
  });
});

describe("roundsWithoutCourse", () => {
  it("is empty when every round has a real course", () => {
    expect(roundsWithoutCourse(weekend(), { c1: COURSE })).toEqual([]);
  });

  it("names rounds with nothing assigned", () => {
    const e = weekend({ rounds: { 1: { courseId: "c1" }, 2: { courseId: null }, 3: {} } });
    expect(roundsWithoutCourse(e, { c1: COURSE })).toEqual(["2", "3"]);
  });

  it("catches a course id that isn't in the library any more", () => {
    const e = weekend({ rounds: { 1: { courseId: "deleted" } } });
    expect(roundsWithoutCourse(e, { c1: COURSE })).toEqual(["1"]);
  });
});

describe("potBalance", () => {
  it("balances when the pots equal the buy-ins", () => {
    // 16 × $100 = $1,600; pots 700 + 700 + 200 + 0 = $1,600
    const b = potBalance(weekend());
    expect(b.collected).toBe(1600);
    expect(b.pots).toBe(1600);
    expect(b.gap).toBe(0);
    expect(b.balanced).toBe(true);
  });

  it("catches money collected that no pot pays out", () => {
    const b = potBalance(weekend({ games: { lowNet: { pot: 700 }, scatts: { pot: 700 }, hio: { pot: 100 } } }));
    expect(b.gap).toBe(100);
    expect(b.balanced).toBe(false);
  });

  it("catches pots bigger than the money coming in", () => {
    expect(potBalance(weekend({ players: field(12) })).gap).toBe(-400);
  });

  it("would have caught the real 2026 gap before anyone teed off", () => {
    const b = potBalance(POCONO);
    expect(b.collected).toBe(1200);
    expect(b.pots).toBe(1100);
    expect(b.gap).toBe(100);
  });
});

describe("suggestPots", () => {
  it("scales the existing split up to a bigger field", () => {
    // 2026's 12-player pots (1100) scaled to 16 × $100 = 1600.
    const s = suggestPots({ ...POCONO, players: field(16) });
    expect(s.target).toBe(1600);
    expect(s.scatts + s.lowNet + s.ctp + s.hio).toBe(1600);
  });

  it("keeps the proportions it was given", () => {
    const s = suggestPots(weekend({ players: field(20) }));   // target 2000, from 1600
    expect(s.target).toBe(2000);
    expect(s.scatts).toBe(875);   // 700 × 1.25
    expect(s.hio).toBe(250);
  });

  it("has nothing to suggest with no pots or no buy-in", () => {
    expect(suggestPots(weekend({ games: {} }))).toBeNull();
    expect(suggestPots(weekend({ weekendBuyIn: 0 }))).toBeNull();
  });
});

describe("groupPlan", () => {
  it("splits 16 into four fours", () => {
    const p = groupPlan(weekend(), 1);
    expect(p.players).toBe(16);
    expect(p.needed).toBe(4);
    expect(p.sizes).toEqual([4, 4, 4, 4]);
  });

  it("balances an awkward field rather than leaving a twosome", () => {
    expect(groupPlan(weekend({ players: field(14) }), 1).sizes).toEqual([4, 4, 3, 3]);
    expect(groupPlan(weekend({ players: field(18) }), 1).sizes).toEqual([4, 4, 4, 3, 3]);
  });

  it("knows when nobody has been paired yet", () => {
    const p = groupPlan(weekend(), 1);
    expect(p.assigned).toBe(0);
    expect(p.complete).toBe(false);
  });

  it("knows when the whole field is paired", () => {
    const e = weekend({ pairings: { 1: { 0: [1, 2, 3, 4], 1: [5, 6, 7, 8], 2: [9, 10, 11, 12], 3: [13, 14, 15, 16] } } });
    const p = groupPlan(e, 1);
    expect(p.assigned).toBe(16);
    expect(p.complete).toBe(true);
  });

  it("spots a half-finished pairing", () => {
    const e = weekend({ pairings: { 1: { 0: [1, 2, 3, 4], 1: [5, 6] } } });
    expect(groupPlan(e, 1).complete).toBe(false);
  });
});

describe("weekendReadiness — Pinehurst, 16 players", () => {
  it("is ready when everything's in place", () => {
    const e = weekend({ pairings: { 1: { 0: [1, 2, 3, 4], 1: [5, 6, 7, 8], 2: [9, 10, 11, 12], 3: [13, 14, 15, 16] } } });
    const r = weekendReadiness(e, { c1: COURSE }, { expectedPlayers: 16 });
    expect(r.blockers).toEqual([]);
    expect(r.ready).toBe(true);
  });

  it("counts the field against what you're expecting", () => {
    const r = weekendReadiness(weekend({ players: field(12) }), { c1: COURSE }, { expectedPlayers: 16 });
    const item = r.items.find(i => i.id === "players");
    expect(item.level).toBe(WARN);
    expect(item.detail).toBe("4 still to add.");
    expect(r.ready).toBe(true);   // short of the target, but nothing stops play
  });

  it("says so when the field is bigger than planned", () => {
    const r = weekendReadiness(weekend({ players: field(18) }), { c1: COURSE }, { expectedPlayers: 16 });
    expect(r.items.find(i => i.id === "players").detail).toBe("2 more than expected.");
  });

  it("blocks on an empty roster", () => {
    const r = weekendReadiness(weekend({ players: [] }), { c1: COURSE });
    expect(r.ready).toBe(false);
    expect(r.blockers.map(b => b.id)).toContain("players");
  });

  it("blocks on a missing handicap and names who", () => {
    const e = weekend({ players: [P(1, "Karl", 10), P(2, "Newcomer", null)] });
    const r = weekendReadiness(e, { c1: COURSE });
    expect(r.ready).toBe(false);
    expect(r.blockers.find(b => b.id === "indexes").detail).toContain("Newcomer");
  });

  it("blocks on a round with no course", () => {
    const e = weekend({ rounds: { 1: { courseId: "c1" }, 2: { courseId: null } } });
    const r = weekendReadiness(e, { c1: COURSE });
    expect(r.ready).toBe(false);
    expect(r.blockers.find(b => b.id === "courses").label).toContain("round 2");
  });

  it("blocks when there are no rounds at all", () => {
    expect(weekendReadiness(weekend({ rounds: {} }), { c1: COURSE }).ready).toBe(false);
  });

  it("warns on money that doesn't balance, without blocking", () => {
    const e = weekend({ games: { lowNet: { pot: 700 }, scatts: { pot: 700 } } });
    const r = weekendReadiness(e, { c1: COURSE });
    const pots = r.warnings.find(w => w.id === "pots");
    expect(pots.label).toBe("Pots are short by $200");
    expect(pots.detail).toBe("16 × $100 = $1600 collected, $1400 in the pots.");
    expect(r.ready).toBe(true);
  });

  it("blocks when no buy-in is set", () => {
    expect(weekendReadiness(weekend({ weekendBuyIn: 0, buyIn: 0 }), { c1: COURSE }).ready).toBe(false);
  });

  it("warns about unpaired rounds and says what the groups should be", () => {
    const r = weekendReadiness(weekend(), { c1: COURSE });
    const w = r.warnings.find(x => x.id === "pairings-1");
    expect(w.detail).toBe("0 of 16 paired — 4 groups of 4/4/4/4.");
  });

  it("warns that locked handicaps need unlocking before a new weekend plays", () => {
    const e = weekend({ rounds: { 1: { courseId: "c1", hcpLock: { at: 1, indexes: { 1: 10 } } } } });
    const r = weekendReadiness(e, { c1: COURSE });
    expect(r.warnings.find(w => w.id === "locked")).toBeTruthy();
  });

  it("orders the list the way you'd work through it", () => {
    const r = weekendReadiness(weekend({ players: [] }), {});
    expect(r.items.map(i => i.id).slice(0, 2)).toEqual(["players", "courses"]);
  });

  it("asks for rounds first when there are none", () => {
    const r = weekendReadiness(weekend({ players: [], rounds: {} }), {});
    expect(r.items.map(i => i.id).slice(0, 2)).toEqual(["players", "rounds"]);
  });
});

describe("cloning 2026 into Pinehurst", () => {
  const next = cloneWeekend(POCONO, { label: "Pinehurst 2027", roundCount: 3 });

  it("brings the twelve across, leaving four to add", () => {
    expect(next.players).toHaveLength(12);
    const r = weekendReadiness(next, LIBRARY, { expectedPlayers: 16 });
    expect(r.items.find(i => i.id === "players").detail).toBe("4 still to add.");
  });

  it("starts with no courses, so that's the first blocker", () => {
    const r = weekendReadiness(next, LIBRARY, { expectedPlayers: 16 });
    expect(r.blockers.map(b => b.id)).toContain("courses");
  });

  it("carries a buy-in and pots that no longer balance at 16", () => {
    // 2026's pots were built for twelve; the same pots against 16 buy-ins leave
    // $500 uncovered. Better to see that now than in the settlement.
    const sixteen = { ...next, players: field(16) };
    expect(potBalance(sixteen).gap).toBe(500);
    const s = suggestPots(sixteen);
    expect(s.scatts + s.lowNet + s.ctp + s.hio).toBe(1600);
  });

  it("leaves last weekend's scores and pairings behind", () => {
    expect(next.pairings).toEqual({});
    for (const r of Object.values(next.rounds)) expect(r.scores).toEqual({});
  });

  it("carries no handicap locks — the new weekend follows live indexes", () => {
    const r = weekendReadiness(next, LIBRARY);
    expect(r.warnings.find(w => w.id === "locked")).toBeUndefined();
  });
});
