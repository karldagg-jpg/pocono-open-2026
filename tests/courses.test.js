import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  coursesFor, roundCourse, snapshotCourse, roundStarted, hasOwnCopy,
  freezeFields, withFrozenCourse, libraryDiffers, roundsUsing, roundCourseState,
} from "../src/lib/courses.js";
import { calcLeaderboard } from "../src/lib/golfLogic.js";
import { settleWeekend } from "../src/lib/settlement.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const POCONO = archive.event;
const LIB = archive.library;

// The library as it would be after someone "fixes" Buck Hill: slope dropped
// and two stroke indexes swapped. Exactly the edit that used to rewrite 2026.
const EDITED = JSON.parse(JSON.stringify(LIB));
EDITED["1"].slope = 120;
[EDITED["1"].si[0], EDITED["1"].si[1]] = [EDITED["1"].si[1], EDITED["1"].si[0]];

describe("coursesFor — the weekend's own copy wins", () => {
  it("prefers the weekend's copy over the library", () => {
    expect(coursesFor(POCONO, EDITED)["1"].slope).toBe(139);
  });

  it("still sees library courses the weekend never copied", () => {
    expect(coursesFor(POCONO, LIB).c_ms92etjiercr.name).toBe("Honey Brook Tee 5");
  });

  it("copes with nothing at all", () => {
    expect(coursesFor(undefined, undefined)).toEqual({});
  });
});

describe("editing the library no longer rewrites a played weekend", () => {
  const score = (lib) => calcLeaderboard({ ...POCONO, courses: coursesFor(POCONO, lib) })
    .map((r) => `${r.player.name}:${r.total}`).join(",");

  it("leaves 2026's leaderboard exactly as it was", () => {
    expect(score(EDITED)).toBe(score(LIB));
  });

  it("leaves 2026's money exactly as it was", () => {
    const net = (lib) => settleWeekend({ ...POCONO, courses: coursesFor(POCONO, lib) }).rows
      .map((r) => `${r.player.name}:${r.net}`).join(",");
    expect(net(EDITED)).toBe(net(LIB));
  });

  it("would have changed the money under the old library-first rule", () => {
    // The point of the change, pinned: same edit, old merge order, different
    // payouts. 2026 plays straight off the index, so the slope edit alone moves
    // nothing — it's the swapped stroke indexes that move strokes, and with
    // them net birdies and scats.
    const oldWay = (lib) => settleWeekend({ ...POCONO, courses: { ...POCONO.courses, ...lib } }).rows
      .map((r) => `${r.player.name}:${r.net}`).join(",");
    expect(oldWay(EDITED)).not.toBe(oldWay(LIB));
  });
});

describe("roundCourse", () => {
  it("finds the course a round is played on", () => {
    expect(roundCourse(POCONO, LIB, 3).name).toBe("Woodloch Springs (Black Tees)");
  });

  it("is null for an unassigned round or an unknown course", () => {
    expect(roundCourse({ rounds: { 1: { courseId: null } } }, LIB, 1)).toBeNull();
    expect(roundCourse({ rounds: { 1: { courseId: "gone" } } }, LIB, 1)).toBeNull();
    expect(roundCourse({ rounds: {} }, LIB, 1)).toBeNull();
  });
});

describe("snapshotCourse", () => {
  it("copies only what scoring needs, deeply", () => {
    const src = { ...LIB["1"], notes: "windy", history: [1, 2] };
    const snap = snapshotCourse(src);
    expect(Object.keys(snap).sort()).toEqual(["name", "par", "rating", "si", "slope"]);
    snap.par[0] = 99;
    expect(src.par[0]).not.toBe(99);
  });

  it("keeps the course and tee names when a course has them", () => {
    expect(snapshotCourse({ name: "X", course: "Pinehurst No. 2", tees: "Blue", par: [] })).toMatchObject({ course: "Pinehurst No. 2", tees: "Blue" });
  });

  it("is null for nothing", () => {
    expect(snapshotCourse(null)).toBeNull();
  });
});

describe("taking the weekend's copy", () => {
  const fresh = () => ({
    rounds: { 1: { courseId: "c_ms92etjiercr", scores: {} }, 2: { courseId: null, scores: {} } },
    courses: {},
  });

  it("knows whether a round has started", () => {
    expect(roundStarted(POCONO, 1)).toBe(true);
    expect(roundStarted(fresh(), 1)).toBe(false);
    const e = fresh(); e.rounds[1].scores = { 5: Array(18).fill(0) };
    expect(roundStarted(e, 1)).toBe(false);   // an all-zero card is no card
  });

  it("asks to copy the course on a round that hasn't got one yet", () => {
    const f = freezeFields(fresh(), LIB, 1);
    expect(Object.keys(f)).toEqual(["courses.c_ms92etjiercr"]);
    expect(f["courses.c_ms92etjiercr"].slope).toBe(121);
  });

  it("asks for nothing once the weekend holds a copy", () => {
    expect(freezeFields(POCONO, EDITED, 1)).toEqual({});
  });

  it("asks for nothing with no course assigned, or one the library doesn't have", () => {
    expect(freezeFields(fresh(), LIB, 2)).toEqual({});
    expect(freezeFields({ rounds: { 1: { courseId: "gone" } }, courses: {} }, LIB, 1)).toEqual({});
  });

  it("applies the copy to local state without touching the original", () => {
    const e = fresh();
    const next = withFrozenCourse(e, LIB, 1);
    expect(hasOwnCopy(next, "c_ms92etjiercr")).toBe(true);
    expect(hasOwnCopy(e, "c_ms92etjiercr")).toBe(false);
    expect(withFrozenCourse(POCONO, LIB, 1)).toBe(POCONO);   // nothing to do → same object
  });
});

describe("libraryDiffers", () => {
  it("spots a library edit made after the weekend took its copy", () => {
    expect(libraryDiffers(POCONO, EDITED, "1")).toBe(true);
    expect(libraryDiffers(POCONO, EDITED, "2")).toBe(false);
  });

  it("ignores a renamed course — the name doesn't change the scoring", () => {
    const renamed = JSON.parse(JSON.stringify(LIB)); renamed["1"].name = "Buck Hill";
    expect(libraryDiffers(POCONO, renamed, "1")).toBe(false);
  });

  it("is false when there's no copy to compare", () => {
    expect(libraryDiffers({ courses: {} }, LIB, "1")).toBe(false);
  });
});

describe("roundsUsing", () => {
  it("lists the rounds a course is on", () => {
    expect(roundsUsing(POCONO, "2")).toEqual([2]);
    expect(roundsUsing({ rounds: { 1: { courseId: "a" }, 3: { courseId: "a" }, 2: { courseId: "b" } } }, "a")).toEqual([1, 3]);
  });

  it("matches a numeric id against a string one", () => {
    expect(roundsUsing({ rounds: { 1: { courseId: 1 } } }, "1")).toEqual([1]);
  });
});

describe("roundCourseState", () => {
  it("describes a played, locked round on its own copy", () => {
    const s = roundCourseState(POCONO, LIB, 1);
    expect(s).toMatchObject({ roundId: 1, courseId: 1, source: "own", started: true, locked: true, outdated: false });
  });

  it("flags the copy as out of date when the library has moved on", () => {
    expect(roundCourseState(POCONO, EDITED, 1).outdated).toBe(true);
  });

  it("describes a round still reading the library", () => {
    const e = { rounds: { 1: { courseId: "c_ms92etjiercr", scores: {} } }, courses: {} };
    expect(roundCourseState(e, LIB, 1)).toMatchObject({ source: "library", started: false, locked: false, outdated: false });
  });

  it("describes an unassigned round", () => {
    expect(roundCourseState({ rounds: { 1: {} } }, LIB, 1)).toMatchObject({ source: "missing", courseId: null, course: null });
  });
});
