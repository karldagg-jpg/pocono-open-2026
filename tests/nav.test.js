import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Live and Casual were built, routed, deployed — and unreachable, because they
// were never added to the nav lists. Nothing failed: the build was clean, the
// tests passed, the code was live. It just couldn't be opened.
//
// This reads App.jsx as text rather than rendering it, because the question is
// about the source of truth for the nav, not about what React does with it.
const APP = fs.readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8");

const tabIds = [...APP.matchAll(/\{\s*id:\s*"(\w+)",\s*label:/g)].map((m) => m[1]);

function list(name) {
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(APP);
  if (!m) throw new Error(`could not find ${name} in App.jsx`);
  return [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]);
}

const PLAY = list("PLAY");
const GET_READY = list("GET_READY");
const EXTRAS = list("EXTRAS");
const ALL = [...PLAY, ...GET_READY, ...EXTRAS];

describe("every screen can actually be opened", () => {
  it("finds the tabs and the nav lists at all", () => {
    expect(tabIds.length).toBeGreaterThan(8);
    expect(tabIds).toContain("live");
    expect(tabIds).toContain("casual");
  });

  it("reaches every tab", () => {
    expect(tabIds.filter((id) => !ALL.includes(id))).toEqual([]);
  });

  it("never lists the same screen twice", () => {
    expect(ALL).toHaveLength(new Set(ALL).size);
  });

  it("navigates only to screens that exist", () => {
    for (const id of ALL) expect(tabIds, `nav lists "${id}" but no such tab`).toContain(id);
  });

  it("routes every tab to a component", () => {
    // A tab in the nav with no route renders a blank screen.
    for (const id of tabIds) {
      expect(APP, `no route for "${id}"`).toMatch(new RegExp(`screen === "${id}"`));
    }
  });
});

describe("the play tabs stay put", () => {
  it("puts Live first — it's the reason to open the app", () => {
    expect(PLAY[0]).toBe("live");
  });

  it("doesn't reorder them between setup and play", () => {
    // They used to swap with the setup screens, so Live moved between Thursday
    // and Saturday. The lists are now plain constants, not phase-dependent.
    expect(APP).not.toMatch(/PLAY\s*=\s*isSetupPhase/);
    expect(APP).toMatch(/\{PLAY\.map\(/);
  });

  it("keeps the getting-ready screens together under Setup", () => {
    expect(GET_READY).toEqual(["setup", "courses", "games", "pairings"]);
  });
});
