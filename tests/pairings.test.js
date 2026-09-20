import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  groupList, toPairingsObject, groupsNeeded, assignedIds, unassignedPlayers,
  removeFromGroups, addToGroup, balancedGroupSizes, autoPair, DEFAULT_GROUP_SIZE,
} from "../src/lib/pairings.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const EVENT = archive.event;
const field = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `P${i + 1}`, hcpIndex: i + 1 }));

describe("groupList", () => {
  it("reads the real 2026 pairings", () => {
    const g = groupList(EVENT.pairings, "1");
    expect(g.length).toBeGreaterThan(0);
    expect(g.flat().length).toBe(8); // round 1 had 8 players assigned
  });

  it("returns however many groups exist, not a fixed three", () => {
    // The bug this replaces: reading groups 0,1,2 by hand dropped the fourth.
    const p = { 1: { 0: [1], 1: [2], 2: [3], 3: [4], 4: [5] } };
    expect(groupList(p, "1")).toHaveLength(5);
    expect(groupList(p, "1")[4]).toEqual([5]);
  });

  it("fills gaps so the array is dense", () => {
    const p = { 1: { 0: [1], 2: [3] } };
    expect(groupList(p, "1")).toEqual([[1], [], [3]]);
  });

  it("is empty for an unknown round or missing pairings", () => {
    expect(groupList({}, "9")).toEqual([]);
    expect(groupList(undefined, "1")).toEqual([]);
  });

  it("round-trips through the stored shape", () => {
    const groups = [[1, 2], [3], [4, 5, 6]];
    expect(groupList({ 1: toPairingsObject(groups) }, "1")).toEqual(groups);
  });
});

describe("groupsNeeded", () => {
  it.each([[12, 3], [16, 4], [13, 4], [4, 1], [1, 1], [24, 6]])(
    "%i players needs %i groups of four", (players, expected) => {
      expect(groupsNeeded(players)).toBe(expected);
    });

  it("is 0 for nobody", () => {
    expect(groupsNeeded(0)).toBe(0);
  });

  it("respects a different group size", () => {
    expect(groupsNeeded(12, 3)).toBe(4);
    expect(groupsNeeded(12, 2)).toBe(6);
  });
});

describe("balancedGroupSizes", () => {
  it("splits evenly when it divides", () => {
    expect(balancedGroupSizes(12)).toEqual([4, 4, 4]);
  });

  it("spreads the remainder rather than stranding a short group", () => {
    // The point: 14 must not become 4/4/4/2, leaving two playing alone.
    expect(balancedGroupSizes(14)).toEqual([4, 4, 3, 3]);
    expect(balancedGroupSizes(13)).toEqual([4, 3, 3, 3]);
    expect(balancedGroupSizes(17)).toEqual([4, 4, 3, 3, 3]);
  });

  it("never differs by more than one between groups", () => {
    for (let n = 1; n <= 40; n++) {
      const s = balancedGroupSizes(n);
      expect(Math.max(...s) - Math.min(...s), `${n} players`).toBeLessThanOrEqual(1);
      expect(s.reduce((a, b) => a + b, 0), `${n} players sum`).toBe(n);
    }
  });
});

describe("addToGroup / removeFromGroups", () => {
  it("adds a player", () => {
    expect(addToGroup([[], []], 1, 7)).toEqual([[], [7]]);
  });

  it("moves a player rather than duplicating them", () => {
    const g = addToGroup([[7], []], 1, 7);
    expect(g).toEqual([[], [7]]);
    expect(g.flat().filter(x => x === 7)).toHaveLength(1);
  });

  it("refuses to overfill a group", () => {
    const full = [[1, 2, 3, 4]];
    expect(addToGroup(full, 0, 9)).toBe(full); // unchanged, same reference
  });

  it("creates groups on demand", () => {
    expect(addToGroup([], 2, 5)).toEqual([[], [], [5]]);
  });

  it("removes from every group", () => {
    expect(removeFromGroups([[1, 2], [2, 3]], 2)).toEqual([[1], [3]]);
  });
});

describe("unassignedPlayers", () => {
  it("lists who still needs a group", () => {
    const players = field(6);
    const pairings = { 1: { 0: [1, 2] } };
    expect(unassignedPlayers(players, pairings, "1").map(p => p.id)).toEqual([3, 4, 5, 6]);
  });

  it("is everyone when nothing is paired", () => {
    expect(unassignedPlayers(field(4), {}, "1")).toHaveLength(4);
  });

  it("finds the real 2026 round-1 stragglers", () => {
    const left = unassignedPlayers(EVENT.players, EVENT.pairings, "1");
    expect(left.length).toBe(EVENT.players.length - assignedIds(EVENT.pairings, "1").size);
  });
});

describe("autoPair", () => {
  it("places every player exactly once", () => {
    for (const n of [4, 12, 13, 16, 20, 24]) {
      const groups = autoPair(field(n));
      const ids = groups.flat();
      expect(ids, `${n} players`).toHaveLength(n);
      expect(new Set(ids).size, `${n} players unique`).toBe(n);
    }
  });

  it("never exceeds the group size", () => {
    for (const n of [5, 14, 17, 23]) {
      for (const g of autoPair(field(n))) expect(g.length).toBeLessThanOrEqual(DEFAULT_GROUP_SIZE);
    }
  });

  it("produces balanced groups", () => {
    const sizes = autoPair(field(14)).map(g => g.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it("spreads strong players across groups rather than stacking them", () => {
    // Snake order: the two lowest handicaps must not end up together.
    const groups = autoPair(field(12), { order: "snake" });
    const best = 1, second = 2;
    const g1 = groups.findIndex(g => g.includes(best));
    const g2 = groups.findIndex(g => g.includes(second));
    expect(g1).not.toBe(g2);
  });

  it("keeps the given order when asked", () => {
    const groups = autoPair(field(8), { order: "listed" });
    expect(groups.flat()).toHaveLength(8);
  });

  it("is repeatable with a seeded rng", () => {
    const rng = () => 0.42;
    expect(autoPair(field(12), { order: "random", rng })).toEqual(autoPair(field(12), { order: "random", rng }));
  });

  it("handles an empty field and a single player", () => {
    expect(autoPair([])).toEqual([]);
    expect(autoPair(field(1))).toEqual([[1]]);
  });

  it("pairs the real 2026 field into three fours", () => {
    const groups = autoPair(EVENT.players);
    expect(groups.map(g => g.length)).toEqual([4, 4, 4]);
  });

  it("pairs a bigger Pinehurst-sized field correctly", () => {
    expect(autoPair(field(16)).map(g => g.length)).toEqual([4, 4, 4, 4]);
    expect(autoPair(field(20)).map(g => g.length)).toEqual([4, 4, 4, 4, 4]);
  });
});
