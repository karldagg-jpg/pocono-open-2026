import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  lockedIndexes, lockStatus, playersAtRound, lockRound, unlockRound,
  setLockedIndex, lockPlayedRounds,
} from "../src/lib/handicapLock.js";
import { calcLeaderboard, calcWinnings, getEffectiveHcp } from "../src/lib/golfLogic.js";
import { liveRound } from "../src/lib/liveBoard.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const POCONO = archive.event;

const COURSE = { name: "T", par: Array(18).fill(4), si: Array.from({ length: 18 }, (_, i) => i + 1), slope: 113, rating: 72 };
const P = (id, name, hcpIndex) => ({ id, name, hcpIndex });
const base = (over = {}) => ({
  players: [P(1, "Steve", 11.4), P(2, "Karl", 10.3)],
  courses: { c1: COURSE },
  rounds: { 1: { courseId: "c1", scores: { 1: Array(18).fill(5), 2: Array(18).fill(5) } } },
  games: {},
  ...over,
});

describe("an unlocked round follows live indexes", () => {
  it("returns the players untouched", () => {
    const e = base();
    expect(lockedIndexes(e, 1)).toBeNull();
    expect(playersAtRound(e, 1)).toBe(e.players);   // same array, no copying
  });

  it("reports itself as unlocked", () => {
    expect(lockStatus(base(), 1)).toEqual({ locked: false, at: null, drifted: [] });
  });

  it("is what you want mid-setup — a changed index moves the score", () => {
    const e = base();
    const before = calcLeaderboard(e).find(r => r.player.name === "Steve").total;
    e.players[0].hcpIndex = 15;
    expect(calcLeaderboard(e).find(r => r.player.name === "Steve").total).not.toBe(before);
  });
});

describe("lockRound", () => {
  it("writes every player's index and stamps the time", () => {
    const e = lockRound(base(), 1, { now: () => 1_700_000_000_000 });
    expect(lockedIndexes(e, 1)).toEqual({ 1: 11.4, 2: 10.3 });
    expect(e.rounds[1].hcpLock.at).toBe(1_700_000_000_000);
  });

  it("doesn't mutate the event it was given", () => {
    const e = base();
    lockRound(e, 1);
    expect(e.rounds[1].hcpLock).toBeUndefined();
  });

  it("leaves the scores and course alone", () => {
    const e = lockRound(base(), 1);
    expect(e.rounds[1].courseId).toBe("c1");
    expect(e.rounds[1].scores[1]).toHaveLength(18);
  });

  it("ignores a round that doesn't exist", () => {
    const e = base();
    expect(lockRound(e, 9)).toBe(e);
  });

  it("treats a missing index as scratch rather than NaN", () => {
    const e = lockRound(base({ players: [P(1, "Guest", undefined)] }), 1);
    expect(lockedIndexes(e, 1)).toEqual({ 1: 0 });
  });
});

describe("a locked round holds its handicaps", () => {
  it("scores off the locked index, not today's", () => {
    // Steve played off 15 and is now an 11.4 — the classic case.
    let e = base({ players: [P(1, "Steve", 15), P(2, "Karl", 10.3)] });
    e = lockRound(e, 1);
    const lockedTotal = calcLeaderboard(e).find(r => r.player.name === "Steve").total;

    e.players[0].hcpIndex = 11.4;     // his index moves
    expect(calcLeaderboard(e).find(r => r.player.name === "Steve").total).toBe(lockedTotal);
  });

  it("hands back players carrying the locked index", () => {
    let e = base({ players: [P(1, "Steve", 15), P(2, "Karl", 10.3)] });
    e = lockRound(e, 1);
    e.players[0].hcpIndex = 11.4;
    const at = playersAtRound(e, 1);
    expect(at.find(p => p.name === "Steve").hcpIndex).toBe(15);
    expect(getEffectiveHcp(at.find(p => p.name === "Steve"), COURSE)).toBe(15);
  });

  it("does not touch the live roster while doing it", () => {
    let e = base({ players: [P(1, "Steve", 15), P(2, "Karl", 10.3)] });
    e = lockRound(e, 1);
    e.players[0].hcpIndex = 11.4;
    playersAtRound(e, 1);
    expect(e.players[0].hcpIndex).toBe(11.4);   // the roster still says what it says
  });

  it("holds the live board steady too", () => {
    let e = base({ players: [P(1, "Steve", 15), P(2, "Karl", 10.3)] });
    e = lockRound(e, 1);
    const before = liveRound(e, 1).rows.map(r => r.netToPar);
    e.players[0].hcpIndex = 11.4;
    expect(liveRound(e, 1).rows.map(r => r.netToPar)).toEqual(before);
  });

  it("holds the money steady too", () => {
    let e = base({
      players: [P(1, "Steve", 15), P(2, "Karl", 10.3)],
      games: { lowNet: { enabled: true, pot: 200, payoutPcts: [100], minRounds: 1 } },
      weekendBuyIn: 100,
    });
    e = lockRound(e, 1);
    const before = JSON.stringify(calcWinnings(e));
    e.players[0].hcpIndex = 11.4;
    expect(JSON.stringify(calcWinnings(e))).toBe(before);
  });

  it("locks each round separately", () => {
    let e = base({
      players: [P(1, "Steve", 15), P(2, "Karl", 10.3)],
      rounds: {
        1: { courseId: "c1", scores: { 1: Array(18).fill(5) } },
        2: { courseId: "c1", scores: { 1: Array(18).fill(5) } },
      },
    });
    e = lockRound(e, 1);
    expect(lockedIndexes(e, 1)[1]).toBe(15);
    expect(lockedIndexes(e, 2)).toBeNull();     // round 2 still live
  });

  it("scores a player who joined after the lock off their own index", () => {
    let e = lockRound(base(), 1);
    e = { ...e, players: [...e.players, P(3, "Newcomer", 20)] };
    const at = playersAtRound(e, 1);
    expect(at.find(p => p.name === "Newcomer").hcpIndex).toBe(20);
    expect(at.find(p => p.name === "Steve").hcpIndex).toBe(11.4);
  });
});

describe("lockStatus", () => {
  it("names everyone whose index has moved since", () => {
    let e = lockRound(base(), 1);
    e.players[0].hcpIndex = 15;
    const s = lockStatus(e, 1);
    expect(s.locked).toBe(true);
    expect(s.drifted).toHaveLength(1);
    expect(s.drifted[0]).toMatchObject({ playedOff: 11.4, nowIs: 15 });
    expect(s.drifted[0].player.name).toBe("Steve");
  });

  it("reports no drift when nothing has changed", () => {
    expect(lockStatus(lockRound(base(), 1), 1).drifted).toEqual([]);
  });

  it("counts who's covered by the lock", () => {
    expect(lockStatus(lockRound(base(), 1), 1).count).toBe(2);
  });
});

describe("unlock and correct", () => {
  it("unlocking puts the round back on live indexes", () => {
    let e = lockRound(base(), 1);
    e = unlockRound(e, 1);
    expect(lockedIndexes(e, 1)).toBeNull();
    expect(e.rounds[1].scores[1]).toHaveLength(18);   // scores survive
  });

  it("unlocking an unlocked round changes nothing", () => {
    const e = base();
    expect(unlockRound(e, 1)).toBe(e);
  });

  it("a wrong locked index can be corrected without unlocking", () => {
    let e = lockRound(base(), 1);
    e = setLockedIndex(e, 1, 1, 15);
    expect(lockedIndexes(e, 1)).toEqual({ 1: 15, 2: 10.3 });
  });

  it("refuses nonsense rather than writing NaN into the money", () => {
    let e = lockRound(base(), 1);
    expect(setLockedIndex(e, 1, 1, "abc")).toBe(e);
    expect(lockedIndexes(setLockedIndex(e, 1, 1, "15"), 1)[1]).toBe(15);
  });

  it("won't correct a round that was never locked", () => {
    const e = base();
    expect(setLockedIndex(e, 1, 1, 15)).toBe(e);
  });
});

describe("lockPlayedRounds", () => {
  const threeRounds = () => base({
    rounds: {
      1: { courseId: "c1", scores: { 1: Array(18).fill(5) } },
      2: { courseId: "c1", scores: { 1: Array(18).fill(0) } },   // nothing posted
      3: { courseId: "c1", scores: {} },
    },
  });

  it("locks only the rounds that have actually been played", () => {
    const e = lockPlayedRounds(threeRounds());
    expect(lockedIndexes(e, 1)).not.toBeNull();
    expect(lockedIndexes(e, 2)).toBeNull();
    expect(lockedIndexes(e, 3)).toBeNull();
  });

  it("leaves an existing lock exactly as it was", () => {
    let e = lockRound(threeRounds(), 1, { now: () => 111 });
    e = lockPlayedRounds(e, { now: () => 999 });
    expect(e.rounds[1].hcpLock.at).toBe(111);
  });
});

describe("the real 2026 weekend — finalized 2026-09-20", () => {
  it("has all three rounds locked, the whole field on each", () => {
    for (const id of Object.keys(POCONO.rounds)) {
      const s = lockStatus(POCONO, id);
      expect(s.locked).toBe(true);
      expect(s.count).toBe(12);
    }
  });

  it("no longer re-scores itself when an index is edited — the bug is shut", () => {
    const before = calcLeaderboard(POCONO).map(r => [r.player.name, r.total]);
    const edited = JSON.parse(JSON.stringify(POCONO));
    edited.players.find(p => p.name === "Steve").hcpIndex = 11.4;
    expect(calcLeaderboard(edited).map(r => [r.player.name, r.total])).toEqual(before);
  });

  it("holds Steve at what he played off, whatever the roster now says", () => {
    const sid = POCONO.players.find(p => p.name === "Steve").id;
    for (const id of Object.keys(POCONO.rounds)) expect(lockedIndexes(POCONO, id)[sid]).toBe(14);
  });

  it("re-locking is a no-op — an existing lock is never overwritten", () => {
    const again = lockPlayedRounds(JSON.parse(JSON.stringify(POCONO)));
    expect(calcLeaderboard(again).map(r => [r.player.name, r.total]))
      .toEqual(calcLeaderboard(POCONO).map(r => [r.player.name, r.total]));
    expect(JSON.stringify(calcWinnings(again))).toBe(JSON.stringify(calcWinnings(POCONO)));
  });

  it("would have paid the same off 15 as off the locked 14", () => {
    // Steve actually played the May weekend off 15. The extra stroke changes no
    // scat and no low-net position, so the locked 14 settles identically — which
    // is why finalizing at 14 was safe rather than merely convenient.
    const sid = POCONO.players.find(p => p.name === "Steve").id;
    let at15 = JSON.parse(JSON.stringify(POCONO));
    for (const id of Object.keys(at15.rounds)) at15 = setLockedIndex(at15, id, sid, 15);
    expect(JSON.stringify(calcWinnings(at15))).toBe(JSON.stringify(calcWinnings(POCONO)));
  });
});
