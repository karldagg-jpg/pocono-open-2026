import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { playedWeekends, allRounds, weekendWinners, careerTable, headToHead } from "../src/lib/allTime.js";
import { settleWeekend } from "../src/lib/settlement.js";
import { cloneWeekend } from "../src/lib/newWeekend.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const POCONO = archive.event;
const LIB = archive.library;
const id = (name) => POCONO.players.find((p) => p.name === name).id;

// A second weekend: the same field a year on, where Karl shoots 10 better every round.
function nextYear() {
  const e = cloneWeekend(POCONO, { label: "Pinehurst 2027", roundCount: 3 });
  e.courses = POCONO.courses;
  for (const r of [1, 2, 3]) {
    e.rounds[r] = JSON.parse(JSON.stringify(POCONO.rounds[r]));
    const k = e.rounds[r].scores[id("Karl")];
    e.rounds[r].scores[id("Karl")] = k.map((s, h) => (h < 10 ? Math.max(1, s - 1) : s));
  }
  return { id: `w_${Date.UTC(2027, 4, 14).toString(36)}`, label: "Pinehurst 2027", event: e };
}
const ONE = [{ id: "pocono-2026", label: "Pocono Open 2026", event: POCONO }];

describe("playedWeekends", () => {
  it("keeps weekends with a full card, oldest first", () => {
    const empty = { id: "w_0", label: "Not played", event: { rounds: { 1: { scores: {} } } } };
    const ws = playedWeekends([nextYear(), ...ONE, empty], LIB);
    expect(ws.map((w) => w.label)).toEqual(["Pocono Open 2026", "Pinehurst 2027"]);
  });
});

describe("allRounds", () => {
  const rounds = allRounds(playedWeekends(ONE, LIB));

  it("has every full card from 2026 — eleven players, three rounds", () => {
    expect(rounds).toHaveLength(33);
  });

  it("matches the leaderboard's numbers", () => {
    const steve = rounds.filter((r) => r.name === "Steve").map((r) => `${r.gross}/${r.net}`);
    expect(steve).toEqual(["86/72", "84/70", "86/72"]);
  });

  it("counts birdies and eagles by gross", () => {
    expect(rounds.every((r) => r.birdies >= 0 && r.eagles >= 0)).toBe(true);
    expect(rounds.reduce((t, r) => t + r.birdies, 0)).toBeGreaterThan(0);
  });
});

describe("weekendWinners", () => {
  it("names 2026's winner from the full three rounds", () => {
    const w = weekendWinners(playedWeekends(ONE, LIB)[0]);
    expect(w.names).toEqual(["Steve"]);
    expect(w.total).toBe(214);
  });
});

describe("careerTable", () => {
  it("adds up to the 2026 settlement for a single weekend", () => {
    const t = careerTable(playedWeekends(ONE, LIB));
    const s = settleWeekend(POCONO);
    for (const row of t) {
      expect(row.net).toBe(s.rows.find((r) => String(r.player.id) === row.key).net);
    }
  });

  it("leaves out someone who was on the roster but never played — Russ", () => {
    expect(careerTable(playedWeekends(ONE, LIB)).map((r) => r.name)).not.toContain("Russ");
  });

  it("carries a player across weekends and adds them up", () => {
    const t = careerTable(playedWeekends([...ONE, nextYear()], LIB));
    const karl = t.find((r) => r.name === "Karl");
    expect(karl.weekends).toBe(2);
    expect(karl.rounds).toBe(6);
    expect(karl.bestGross.label).toBe("Pinehurst 2027");
    expect(karl.bestGross.score).toBe(69);    // 79 at Great Bear, ten shots better
  });

  it("counts a win to the weekend's winner", () => {
    const t = careerTable(playedWeekends(ONE, LIB));
    expect(t.find((r) => r.name === "Steve").wins).toBe(1);
    expect(t.filter((r) => r.wins).map((r) => r.name)).toEqual(["Steve"]);
  });

  it("is sorted by money", () => {
    const nets = careerTable(playedWeekends(ONE, LIB)).map((r) => r.net);
    expect(nets).toEqual([...nets].sort((a, b) => b - a));
  });
});

describe("headToHead", () => {
  it("compares every round both finished", () => {
    const h = headToHead(playedWeekends(ONE, LIB), id("Steve"), id("Jake"));
    // Steve 72/70/72 against Jake 72/74/72: one win, two halved, 4 shots better.
    expect(h).toMatchObject({ rounds: 3, aWins: 1, bWins: 0, halved: 2, strokes: -4 });
  });

  it("reads the same from the other side", () => {
    const h = headToHead(playedWeekends(ONE, LIB), id("Jake"), id("Steve"));
    expect(h).toMatchObject({ aWins: 0, bWins: 1, strokes: 4 });
  });

  it("is empty against someone who never played", () => {
    expect(headToHead(playedWeekends(ONE, LIB), id("Steve"), id("Russ")).rounds).toBe(0);
  });
});
