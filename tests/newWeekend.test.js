import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { cloneWeekend, describeClone, blankRounds, resetGames, NOT_CARRIED } from "../src/lib/newWeekend.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const POCONO = archive.event;

describe("blankRounds", () => {
  it("makes the number asked for, each empty", () => {
    const r = blankRounds(3);
    expect(Object.keys(r)).toEqual(["1", "2", "3"]);
    expect(r[1]).toEqual({ courseId: null, scores: {} });
  });

  it("supports a weekend that isn't three rounds", () => {
    expect(Object.keys(blankRounds(4))).toHaveLength(4);
    expect(Object.keys(blankRounds(2))).toHaveLength(2);
  });

  it("handles zero and nonsense", () => {
    expect(blankRounds(0)).toEqual({});
    expect(blankRounds(-2)).toEqual({});
  });
});

describe("resetGames", () => {
  it("keeps the settings", () => {
    const g = resetGames(POCONO.games);
    expect(g.lowNet.pot).toBe(POCONO.games.lowNet.pot);
    expect(g.lowNet.payoutPcts).toEqual(POCONO.games.lowNet.payoutPcts);
    expect(g.scatts.enabled).toBe(true);
  });

  it("drops last weekend's closest-to-pin winners", () => {
    const src = { ctp: { enabled: true, pot: 50, results: { 1: { 4: "Karl" } }, holes: { 1: [4, 12] } } };
    const g = resetGames(src);
    expect(g.ctp.enabled).toBe(true);
    expect(g.ctp.results).toEqual({});
    expect(g.ctp.holes).toEqual({});
  });

  it("doesn't mutate the source", () => {
    const src = { ctp: { results: { 1: "x" }, holes: { 1: [4] } } };
    resetGames(src);
    expect(src.ctp.results).toEqual({ 1: "x" });
  });

  it("copes with no games at all", () => {
    expect(resetGames(undefined)).toEqual({});
  });
});

describe("cloneWeekend — from the real Pocono event", () => {
  it("brings the field across", () => {
    const next = cloneWeekend(POCONO, { label: "Pinehurst 2027" });
    expect(next.players).toHaveLength(12);
    expect(next.players.map(p => p.name)).toContain("Karl");
    expect(next.name).toBe("Pinehurst 2027");
  });

  it("keeps each player's index", () => {
    const next = cloneWeekend(POCONO, { label: "x" });
    const karl = next.players.find(p => p.name === "Karl");
    expect(karl.hcpIndex).toBe(10.3);
  });

  it("can wipe indexes for a fresh assessment", () => {
    const next = cloneWeekend(POCONO, { label: "x", resetIndexes: true });
    expect(next.players.every(p => p.hcpIndex === 0)).toBe(true);
    expect(next.players).toHaveLength(12); // still everyone
  });

  it("leaves last weekend's scores behind", () => {
    const next = cloneWeekend(POCONO, { label: "x" });
    for (const r of Object.values(next.rounds)) expect(r.scores).toEqual({});
    expect(next.pairings).toEqual({});
    expect(next.sixies).toBeUndefined();
  });

  it("does not carry courses — a new venue means new courses", () => {
    expect(Object.keys(POCONO.courses).length).toBeGreaterThan(0);
    expect(cloneWeekend(POCONO, { label: "x" }).courses).toEqual({});
  });

  it("carries the buy-in and game settings", () => {
    const next = cloneWeekend(POCONO, { label: "x" });
    expect(next.weekendBuyIn).toBe(100);
    expect(next.games.lowNet.enabled).toBe(true);
    expect(next.games.scatts.potByRound).toEqual(POCONO.games.scatts.potByRound);
  });

  it("can start with nobody or no games when asked", () => {
    const bare = cloneWeekend(POCONO, { label: "x", keepPlayers: false, keepGames: false });
    expect(bare.players).toEqual([]);
    expect(bare.games).toEqual({});
    expect(bare.weekendBuyIn).toBe(100); // buy-in still sensible
  });

  it("makes the number of rounds asked for", () => {
    expect(Object.keys(cloneWeekend(POCONO, { label: "x", roundCount: 4 }).rounds)).toHaveLength(4);
  });

  it("never mutates the source event", () => {
    const before = JSON.stringify(POCONO);
    cloneWeekend(POCONO, { label: "x", resetIndexes: true });
    expect(JSON.stringify(POCONO)).toBe(before);
  });

  it("copies players rather than sharing them with the old event", () => {
    const next = cloneWeekend(POCONO, { label: "x" });
    next.players[0].name = "Changed";
    expect(POCONO.players[0].name).not.toBe("Changed");
  });

  it("works from nothing at all", () => {
    const next = cloneWeekend(null, { label: "First weekend" });
    expect(next.players).toEqual([]);
    expect(next.weekendBuyIn).toBe(100);
    expect(Object.keys(next.rounds)).toHaveLength(3);
  });

  it("names itself rather than ending up blank", () => {
    expect(cloneWeekend(POCONO, { label: "   " }).name).toBe("New weekend");
  });
});

describe("describeClone", () => {
  it("says what comes across", () => {
    const d = describeClone(POCONO, { label: "Pinehurst 2027" });
    expect(d.players).toBe(12);
    expect(d.rounds).toBe(3);
    expect(d.buyIn).toBe(100);
    expect(d.gamesEnabled).toEqual(expect.arrayContaining(["scatts", "lowNet", "hio", "ctp"]));
  });

  it("says what gets left behind, and only what's actually there", () => {
    const d = describeClone(POCONO, { label: "x" });
    expect(d.leavesBehind).toEqual(expect.arrayContaining(["rounds", "pairings", "sixies", "courses"]));
    // birdieOptOuts is empty in the real event, so it shouldn't be mentioned
    expect(d.leavesBehind).not.toContain("birdieOptOuts");
  });

  it("mentions nothing when starting from nothing", () => {
    expect(describeClone(null, { label: "x" }).leavesBehind).toEqual([]);
  });

  it("lists every non-carried key as a possibility", () => {
    expect(NOT_CARRIED).toEqual(expect.arrayContaining(["rounds", "pairings", "sixies", "courses"]));
  });
});
