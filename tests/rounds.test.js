import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { roundIds, roundCount, isFinalRound, DEFAULT_ROUNDS } from "../src/lib/rounds.js";
import { calcLeaderboard, calcWinnings, calcLowNet } from "../src/lib/golfLogic.js";
import { settleWeekend } from "../src/lib/settlement.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const POCONO = archive.event;

const COURSE = { name: "Flat", par: Array(18).fill(4), si: Array.from({ length: 18 }, (_, i) => i + 1), slope: 113, rating: 72 };
const card = (n) => Array(18).fill(n);
const players = [
  { id: 1, name: "Ann", hcpIndex: 0 },
  { id: 2, name: "Ben", hcpIndex: 0 },
];
// Four rounds. Ann birdies every hole of rounds 1–3 while Ben pars; round 4 is
// the other way round. Birdies, because a par wins no scat.
function fourRounds(over = {}) {
  const r = (a, b) => ({ courseId: "c", scores: { 1: card(a), 2: card(b) } });
  return {
    players, courses: { c: COURSE },
    rounds: { 1: r(3, 4), 2: r(3, 4), 3: r(3, 4), 4: r(4, 3) },
    games: { lowNet: { enabled: true, pot: 100, payoutPcts: [100] }, scatts: { enabled: true, pot: 400 } },
    weekendBuyIn: 250, optOuts: [], birdieOptOuts: [],
    ...over,
  };
}

describe("roundIds", () => {
  it("reads the real weekend's three rounds", () => {
    expect(roundIds(POCONO)).toEqual([1, 2, 3]);
  });

  it("sorts numerically, so round 10 comes after round 2", () => {
    expect(roundIds({ rounds: { 10: {}, 2: {}, 1: {} } })).toEqual([1, 2, 10]);
  });

  it("falls back to the classic three on a brand-new weekend", () => {
    expect(roundIds({ rounds: {} })).toEqual(DEFAULT_ROUNDS);
    expect(roundIds(undefined)).toEqual([1, 2, 3]);
  });

  it("ignores keys that aren't round numbers", () => {
    expect(roundIds({ rounds: { 1: {}, 2: {}, notes: {}, 0: {} } })).toEqual([1, 2]);
  });

  it("returns a fresh array — callers can't corrupt the default", () => {
    roundIds({}).push(99);
    expect(DEFAULT_ROUNDS).toEqual([1, 2, 3]);
  });
});

describe("isFinalRound", () => {
  it("is round 3 of three and round 4 of four", () => {
    expect(isFinalRound(POCONO, 3)).toBe(true);
    expect(isFinalRound(POCONO, 2)).toBe(false);
    expect(isFinalRound(fourRounds(), 3)).toBe(false);
    expect(isFinalRound(fourRounds(), "4")).toBe(true);
  });
});

describe("a four-round weekend", () => {
  it("counts all four rounds on the leaderboard", () => {
    const board = calcLeaderboard(fourRounds());
    const ann = board.find((r) => r.player.name === "Ann");
    expect(ann.roundNets).toHaveLength(4);
    expect(ann.roundsPlayed).toBe(4);
    // Ann 54·3 + 72 = 234; Ben 72·3 + 54 = 270.
    expect(ann.totalGross).toBe(234);
    expect(board[0].player.name).toBe("Ann");
  });

  it("makes the fourth round count — a big enough round 4 swings it", () => {
    // Ann 162 + 126 = 288, Ben 216 + 54 = 270. Ignore round 4 and Ann wins.
    const ev = fourRounds();
    ev.rounds[4].scores = { 1: card(7), 2: card(3) };
    expect(calcLeaderboard(ev)[0].player.name).toBe("Ben");
  });

  it("requires all four rounds for low net unless told otherwise", () => {
    expect(roundCount(fourRounds())).toBe(4);
    const ev = fourRounds();
    delete ev.rounds[4].scores[2];      // Ben skips round 4
    const ln = calcLowNet(ev);
    expect(ln.positions.flat().map((r) => r.player.name)).toEqual(["Ann"]);
  });

  it("pays scats in round 4 and splits a flat pot four ways, not three", () => {
    const w = calcWinnings(fourRounds());
    // $400 flat pot over four rounds is $100 a round. Ann takes every hole of
    // rounds 1–3, Ben every hole of round 4: $300 and $100. With the old /3 a
    // round was worth $133 and round 4 paid nothing.
    expect(w[1].scatts).toBe(300);
    expect(w[2].scatts).toBe(100);
  });

  it("still balances in the settlement", () => {
    const s = settleWeekend(fourRounds());
    expect(s.totals.paidOut).toBe(s.pots.total);
  });
});

describe("the real three-round weekend is unchanged", () => {
  it("still requires three rounds for low net by default", () => {
    expect(roundCount(POCONO)).toBe(3);
  });
});

import { splitAcrossRounds, perRound } from "../src/lib/rounds.js";

describe("splitAcrossRounds", () => {
  it("shares evenly when it divides", () => {
    expect(splitAcrossRounds(300, [1, 2, 3])).toEqual({ 1: 100, 2: 100, 3: 100 });
    expect(splitAcrossRounds(400, [1, 2, 3, 4])).toEqual({ 1: 100, 2: 100, 3: 100, 4: 100 });
  });

  it("always adds back up to the total", () => {
    for (const total of [1, 7, 100, 499, 1000]) {
      for (const n of [1, 2, 3, 4, 5, 6]) {
        const ids = Array.from({ length: n }, (_, i) => i + 1);
        const parts = Object.values(splitAcrossRounds(total, ids));
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it("puts the odd dollars on the first round by default, or the last if asked", () => {
    expect(splitAcrossRounds(100, [1, 2, 3])).toEqual({ 1: 34, 2: 33, 3: 33 });
    expect(splitAcrossRounds(100, [1, 2, 3], { remainderTo: "last" })).toEqual({ 1: 33, 2: 33, 3: 34 });
  });

  it("is empty with no rounds and zero with no money", () => {
    expect(splitAcrossRounds(100, [])).toEqual({});
    expect(splitAcrossRounds(0, [1, 2])).toEqual({ 1: 0, 2: 0 });
    expect(splitAcrossRounds("", [1])).toEqual({ 1: 0 });
  });
});

describe("perRound", () => {
  it("gives every round the same value", () => {
    expect(perRound([1, 2, 3, 4], true)).toEqual({ 1: true, 2: true, 3: true, 4: true });
  });
});
