// Every screen, rendered against real and awkward weekends.
//
// A screen that throws takes the whole app down with it, and the awkward cases
// are exactly the ones nobody clicks through before a trip: a brand-new weekend
// with no indexes yet, a fourth round, nobody paired. This renders each screen
// against them so a crash shows up here rather than on the first tee.
import { describe, it, expect, beforeAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import fs from "fs";
import path from "path";
import { cloneWeekend } from "../src/lib/newWeekend.js";

beforeAll(() => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
  };
});

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const LIB = archive.library;
const noop = () => {};

const WEEKENDS = {
  "Pocono 2026 (archived)": archive.event,
  "Pinehurst, just created, indexes wiped": cloneWeekend(archive.event, { label: "Pinehurst", roundCount: 3, resetIndexes: true }),
  "Pinehurst, four rounds, courses set": (() => {
    const e = cloneWeekend(archive.event, { label: "Pinehurst", roundCount: 4 });
    for (const r of Object.keys(e.rounds)) e.rounds[r].courseId = "1";
    return e;
  })(),
  "empty weekend": { players: [], courses: {}, rounds: {}, pairings: {}, games: {} },
};

const SCREENS = {
  LiveScreen: (event) => ({ event, library: LIB, weekendLabel: "Test" }),
  LeaderboardScreen: (event) => ({ event, library: LIB }),
  ScoringScreen: (event) => ({ event, library: LIB, saveEvent: noop }),
  ScattsScreen: (event) => ({ event, library: LIB }),
  WinningsScreen: (event) => ({ event, library: LIB }),
  GamesScreen: (event) => ({ event, library: LIB, saveEvent: noop }),
  PairingsScreen: (event) => ({ event, saveEvent: noop }),
  CourseScreen: (event) => ({ event, library: LIB, saveEvent: noop }),
  SetupScreen: (event) => ({ event, library: LIB, saveEvent: noop, authed: true, setAdminPin: noop }),
  ReplayScreen: (event) => ({ event, library: LIB }),
  ThursdayScreen: (event) => ({ event, saveEvent: noop }),
};

for (const [wname, event] of Object.entries(WEEKENDS)) {
  describe(wname, () => {
    for (const [screen, props] of Object.entries(SCREENS)) {
      it(`${screen} renders`, async () => {
        const C = (await import(`../src/components/${screen}.jsx`)).default;
        const html = renderToStaticMarkup(React.createElement(C, props(event)));
        expect(html.length).toBeGreaterThan(0);
      });
    }
  });
}

describe("a four-round weekend shows its fourth round", () => {
  const four = WEEKENDS["Pinehurst, four rounds, courses set"];
  const text = async (screen) => {
    const C = (await import(`../src/components/${screen}.jsx`)).default;
    return renderToStaticMarkup(React.createElement(C, SCREENS[screen](four))).replace(/<[^>]+>/g, " ");
  };
  for (const screen of ["ScoringScreen", "ScattsScreen", "PairingsScreen", "ReplayScreen", "GamesScreen"]) {
    it(`on ${screen}`, async () => {
      expect(await text(screen)).toMatch(/Round 4/);
    });
  }
  it("on the Leaderboard as an R4 column", async () => {
    expect(await text("LeaderboardScreen")).toMatch(/R4/);
  });
});
