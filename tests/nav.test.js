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

/** The two arrays of a `const NAME = isSetupPhase ? [...] : [...]` pair. */
function navLists(name) {
  const re = new RegExp(`const ${name} = isSetupPhase\\s*\\?\\s*\\[([^\\]]*)\\]\\s*:\\s*\\[([^\\]]*)\\]`);
  const m = re.exec(APP);
  if (!m) throw new Error(`could not find ${name} in App.jsx`);
  const ids = (s) => [...s.matchAll(/"(\w+)"/g)].map((x) => x[1]);
  return { setup: ids(m[1]), playing: ids(m[2]) };
}

const PRIMARY = navLists("PRIMARY");
const MORE = navLists("MORE");
const reachable = (phase) => new Set([...PRIMARY[phase], ...MORE[phase]]);

describe("every screen can actually be opened", () => {
  it("finds the tabs and the nav lists at all", () => {
    expect(tabIds.length).toBeGreaterThan(8);
    expect(tabIds).toContain("live");
    expect(tabIds).toContain("casual");
  });

  it("reaches every tab while a round is being played", () => {
    const can = reachable("playing");
    const missing = tabIds.filter((id) => !can.has(id));
    expect(missing).toEqual([]);
  });

  it("reaches every tab during setup", () => {
    const can = reachable("setup");
    const missing = tabIds.filter((id) => !can.has(id));
    expect(missing).toEqual([]);
  });

  it("puts Live first once play has started — it's the reason to open the app", () => {
    expect(PRIMARY.playing[0]).toBe("live");
  });

  it("never lists the same screen twice in one phase", () => {
    for (const phase of ["setup", "playing"]) {
      const all = [...PRIMARY[phase], ...MORE[phase]];
      expect(all).toHaveLength(new Set(all).size);
    }
  });

  it("navigates only to screens that exist", () => {
    const known = new Set(tabIds);
    for (const phase of ["setup", "playing"]) {
      for (const id of [...PRIMARY[phase], ...MORE[phase]]) {
        expect(known, `nav lists "${id}" but no such tab`).toContain(id);
      }
    }
  });

  it("routes every tab to a component", () => {
    // A tab in the nav with no route renders a blank screen.
    for (const id of tabIds) {
      expect(APP, `no route for "${id}"`).toMatch(new RegExp(`screen === "${id}"`));
    }
  });
});
