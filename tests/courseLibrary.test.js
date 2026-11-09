import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  displayName, courseKey, libraryEntries, groupByCourse, searchEntries,
  validateCourse, parseHoleRow, newTeesFrom, cleanEntry, parTotal,
  weekendTime, courseHistory, sortEntries, weekendsRelyingOn, DEFAULT_PAR, DEFAULT_SI,
} from "../src/lib/courseLibrary.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const POCONO = archive.event;
const LIB = archive.library;
const WEEKENDS = [{ id: "pocono-2026", label: "Pocono Open 2026", event: POCONO }];

const good = (over = {}) => ({ course: "Pinehurst No. 2", tees: "Blue", slope: 138, rating: 75.1, par: [...DEFAULT_PAR], si: [...DEFAULT_SI], ...over });

describe("naming and grouping", () => {
  it("shows Course · Tees when an entry has both", () => {
    expect(displayName({ course: "Pinehurst No. 2", tees: "Blue", name: "x" })).toBe("Pinehurst No. 2 · Blue");
  });

  it("keeps the old single name for entries made before tees existed", () => {
    expect(displayName(LIB["1"])).toBe("Buck Hill Golf Club White/blue (White tees)");
  });

  it("never shows a blank name", () => {
    expect(displayName({})).toBe("Unnamed course");
  });

  it("groups tee sets of the same course together, case and spacing aside", () => {
    const entries = [
      { id: "a", course: "Pinehurst No. 2", tees: "Blue" },
      { id: "b", course: "pinehurst no. 2 ", tees: "White" },
      { id: "c", course: "Pinehurst No. 4", tees: "Blue" },
    ];
    const g = groupByCourse(entries);
    expect(g.map((x) => x.entries.map((e) => e.id))).toEqual([["a", "b"], ["c"]]);
    expect(g[0].course).toBe("Pinehurst No. 2");
  });

  it("leaves the existing library as one course per entry", () => {
    const g = groupByCourse(libraryEntries(LIB));
    expect(g).toHaveLength(Object.keys(LIB).length);
    expect(courseKey(LIB["1"])).toBe("buck hill golf club white/blue (white tees)");
  });
});

describe("searchEntries", () => {
  const entries = libraryEntries(LIB);
  it("finds by any part of the name, ignoring case", () => {
    expect(searchEntries(entries, "woodloch").map((e) => e.id)).toEqual(["3"]);
    expect(searchEntries(entries, "BLUE").map((e) => e.id).sort()).toEqual(["1", "2"]);
  });

  it("finds by tee name on new-style entries", () => {
    expect(searchEntries([{ id: "x", course: "Pinehurst", tees: "Gold" }], "gold")).toHaveLength(1);
  });

  it("returns everything for an empty search", () => {
    expect(searchEntries(entries, "  ")).toHaveLength(entries.length);
  });
});

describe("validateCourse", () => {
  it("passes a complete, sensible course", () => {
    expect(validateCourse(good())).toEqual({ errors: [], warnings: [], ok: true });
  });

  it("passes every course already in the library", () => {
    for (const c of Object.values(LIB)) expect(validateCourse(c).errors).toEqual([]);
  });

  it("catches a stroke index used twice, and says which holes", () => {
    const si = [...DEFAULT_SI]; si[1] = si[0];     // hole 2 now has SI 1, same as hole 1
    const v = validateCourse(good({ si }));
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("Stroke index 1 is on holes 1 and 2 — each number is used once.");
  });

  it("names a stroke index that's missing entirely", () => {
    const si = [...DEFAULT_SI]; si[0] = 0;
    expect(validateCourse(good({ si })).errors.join(" ")).toMatch(/hole 1/);
  });

  it("catches a par outside 3 to 6", () => {
    const par = [...DEFAULT_PAR]; par[4] = 7; par[8] = 2;
    expect(validateCourse(good({ par })).errors).toContain("Par must be 3 to 6 — check holes 5, 9.");
  });

  it("insists on a name", () => {
    expect(validateCourse(good({ course: " ", name: "" })).errors).toContain("Give the course a name.");
  });

  it("catches a slope that can't be right", () => {
    expect(validateCourse(good({ slope: 13 })).ok).toBe(false);
    expect(validateCourse(good({ slope: 200 })).ok).toBe(false);
    expect(validateCourse(good({ slope: "" })).ok).toBe(false);
  });

  it("warns, without blocking, when the rating looks like the slope", () => {
    const v = validateCourse(good({ rating: 138 }));
    expect(v.ok).toBe(true);
    expect(v.warnings[0]).toMatch(/not the slope/);
  });

  it("requires a rating", () => {
    expect(validateCourse(good({ rating: "" })).errors).toContain("Add the course rating.");
  });

  it("warns on an odd par total", () => {
    expect(validateCourse(good({ par: Array(18).fill(3) })).warnings.join(" ")).toMatch(/Par 54/);
  });
});

describe("parseHoleRow — typing in a scorecard row", () => {
  it("reads nine numbers with spaces", () => {
    expect(parseHoleRow("4 4 3 5 4 3 4 5 4")).toEqual({ values: [4, 4, 3, 5, 4, 3, 4, 5, 4], error: null });
  });

  it("reads eighteen with commas, tabs or anything in between", () => {
    const r = parseHoleRow("1,5,13,3\t9,17 7/11 15 2 6 14 4 10 18 8 12 16", { kind: "si" });
    expect(r.values).toEqual(DEFAULT_SI);
    expect(r.error).toBeNull();
  });

  it("splits par digits run together", () => {
    expect(parseHoleRow("443543454").values).toEqual([4, 4, 3, 5, 4, 3, 4, 5, 4]);
  });

  it("does not split stroke indexes run together — they're two digits", () => {
    expect(parseHoleRow("151331917", { kind: "si" }).error).toMatch(/Found 1 number/);
  });

  it("says how many it found when the count is wrong", () => {
    expect(parseHoleRow("4 4 3").error).toBe("Found 3 numbers — a scorecard row has 9 or 18.");
    expect(parseHoleRow("").error).toBe("Nothing to read.");
  });
});

describe("new tees from an existing course", () => {
  it("copies the holes and leaves the numbers to fill in", () => {
    const d = newTeesFrom(LIB["3"]);
    expect(d.par).toEqual(LIB["3"].par);
    expect(d.si).toEqual(LIB["3"].si);
    expect(d.slope).toBe("");
    expect(d.course).toBe("Woodloch Springs (Black Tees)");
  });

  it("copies, rather than shares, the hole arrays", () => {
    const d = newTeesFrom(LIB["3"]);
    d.par[0] = 99;
    expect(LIB["3"].par[0]).not.toBe(99);
  });
});

describe("cleanEntry", () => {
  it("stores course, tees and a combined name older screens can show", () => {
    const e = cleanEntry({ ...good(), slope: "138", rating: "75.1" });
    expect(e).toMatchObject({ name: "Pinehurst No. 2 · Blue", course: "Pinehurst No. 2", tees: "Blue", slope: 138, rating: 75.1 });
    expect(parTotal(e)).toBe(72);
  });

  it("uses just the course name when there are no tees", () => {
    expect(cleanEntry({ ...good(), tees: "" }).name).toBe("Pinehurst No. 2");
  });
});

describe("weekendTime", () => {
  it("reads a new weekend's creation time from its id", () => {
    const t = Date.UTC(2026, 10, 9);
    expect(weekendTime(`w_${t.toString(36)}`, {})).toBe(t);
  });

  it("falls back to when an older weekend's rounds were locked", () => {
    expect(weekendTime("pocono-2026", POCONO)).toBeGreaterThan(Date.UTC(2026, 4, 1));
  });

  it("is zero when there's nothing to go on", () => {
    expect(weekendTime("old", { rounds: { 1: {} } })).toBe(0);
  });
});

describe("courseHistory — where we've played it", () => {
  it("summarises Buck Hill from the real weekend", () => {
    const h = courseHistory(WEEKENDS, "1");
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ label: "Pocono Open 2026", roundId: 1, cards: 11, bestGross: { name: "Jake", score: 81 } });
  });

  it("names everyone tied for low net", () => {
    // Round 1: Steve and Jake both net 72 — the leaderboard says so too.
    expect(courseHistory(WEEKENDS, "1")[0].lowNet).toEqual({ name: "Steve & Jake", score: 72 });
    expect(courseHistory(WEEKENDS, "2")[0].lowNet).toEqual({ name: "Karl", score: 69 });
  });

  it("averages only full cards", () => {
    // Russ has no card and is left out: 11 cards, not 12.
    expect(courseHistory(WEEKENDS, "3")[0].cards).toBe(11);
    expect(courseHistory(WEEKENDS, "3")[0].avgGross).toBe(101.1);
  });

  it("scores the round off the indexes it was locked at", () => {
    // Steve's live index has moved since May; the locked round still says 72.
    const moved = { ...POCONO, players: POCONO.players.map((p) => (p.name === "Steve" ? { ...p, hcpIndex: 11 } : p)) };
    expect(courseHistory([{ id: "p", event: moved }], "1")[0].lowNet.name).toBe("Steve & Jake");
  });

  it("is empty for a course never played", () => {
    expect(courseHistory(WEEKENDS, "c_ms92etjiercr")).toEqual([]);
  });

  it("puts the newest weekend first", () => {
    const later = { id: `w_${Date.UTC(2027, 4, 14).toString(36)}`, label: "Pinehurst 2027", event: POCONO };
    expect(courseHistory([...WEEKENDS, later], "1").map((h) => h.label)).toEqual(["Pinehurst 2027", "Pocono Open 2026"]);
  });
});

describe("sortEntries — most useful first", () => {
  const entries = libraryEntries(LIB);

  it("puts this weekend's courses first", () => {
    const ev = { rounds: { 1: { courseId: "c_ms92etjiercr" } } };
    expect(sortEntries(entries, { event: ev, weekends: WEEKENDS })[0].id).toBe("c_ms92etjiercr");
  });

  it("then the courses played, then the rest by name", () => {
    const ids = sortEntries(entries, { event: { rounds: {} }, weekends: WEEKENDS }).map((e) => e.id);
    expect(ids.slice(0, 3).sort()).toEqual(["1", "2", "3"]);
    expect(ids.slice(3)).toEqual(["c_ms92etjiercr"]);
  });

  it("puts the most recently played ahead of older ones", () => {
    const pinehurst = JSON.parse(JSON.stringify(POCONO));
    for (const r of Object.values(pinehurst.rounds)) r.courseId = 2;
    const w = [...WEEKENDS, { id: `w_${Date.UTC(2027, 4, 14).toString(36)}`, event: pinehurst }];
    expect(sortEntries(entries, { weekends: w })[0].id).toBe("2");
  });
});

describe("weekendsRelyingOn — what a delete would break", () => {
  it("never includes a played weekend, which keeps its own copy", () => {
    expect(weekendsRelyingOn(WEEKENDS, "1")).toEqual([]);
  });

  it("names a weekend still being set up that points at the course", () => {
    const setup = { id: "w_x", label: "Pinehurst 2027", event: { courses: {}, rounds: { 1: { courseId: "c9" }, 2: { courseId: "c9" }, 3: {} } } };
    expect(weekendsRelyingOn([...WEEKENDS, setup], "c9")).toEqual([{ weekendId: "w_x", label: "Pinehurst 2027", rounds: [1, 2] }]);
  });
});

import { holeProblems } from "../src/lib/courseLibrary.js";

describe("holeProblems — which boxes to outline", () => {
  it("marks both holes sharing a stroke index", () => {
    const si = [...DEFAULT_SI]; si[1] = si[0];
    expect([...holeProblems({ par: DEFAULT_PAR, si }).si]).toEqual([0, 1]);
  });

  it("marks a blank or impossible value", () => {
    const par = [...DEFAULT_PAR]; par[3] = ""; par[7] = 9;
    const si = [...DEFAULT_SI]; si[17] = 19;
    const p = holeProblems({ par, si });
    expect([...p.par]).toEqual([3, 7]);
    expect([...p.si]).toEqual([17]);
  });

  it("marks nothing on a good card", () => {
    const p = holeProblems({ par: DEFAULT_PAR, si: DEFAULT_SI });
    expect(p.par.size + p.si.size).toBe(0);
  });
});
