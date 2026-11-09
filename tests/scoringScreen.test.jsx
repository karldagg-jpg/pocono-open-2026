import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import fs from "fs";
import path from "path";
import ScoringScreen from "../src/components/ScoringScreen.jsx";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
let store;
beforeEach(() => {
  store = { "pocono:onCourse": "1" };
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
});

const render = () => renderToStaticMarkup(<ScoringScreen event={archive.event} library={archive.library} saveEvent={() => {}} />)
  .replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("Scoring on course", () => {
  it("folds round, group and progress into one line", () => {
    expect(render()).toMatch(/R1 · Group 1 · 18\/18/);
  });

  it("hides the round tabs, lock panel and hole grid until asked", () => {
    const t = render();
    expect(t).not.toMatch(/Round 2/);
    expect(t).not.toMatch(/Handicaps locked/);
    expect(t).not.toMatch(/OUT · Par/);
  });

  it("shows the hole big, with a way on", () => {
    const t = render();
    expect(t).toMatch(/Hole 1 Par 4 · SI 13/);
    expect(t).toMatch(/Next: hole 2 →/);
  });

  it("comes back to the round and group this phone was keeping", () => {
    store["pocono:scoring"] = JSON.stringify({ round: 3, group: 2 });
    expect(render()).toMatch(/R3 · Group 3 ·/);
  });

  it("ignores a remembered round the weekend doesn't have", () => {
    store["pocono:scoring"] = JSON.stringify({ round: 9, group: 0 });
    expect(render()).toMatch(/R1 · Group 1/);
  });

  it("falls back to the first group if the remembered one is gone", () => {
    store["pocono:scoring"] = JSON.stringify({ round: 1, group: 7 });
    expect(render()).toMatch(/R1 · Group 1 ·/);
  });
});

describe("Scoring in the clubhouse", () => {
  it("still shows the full controls", () => {
    store["pocono:onCourse"] = "0";
    const t = render();
    expect(t).toMatch(/Scoring/);
    expect(t).toMatch(/Round 2/);
    expect(t).toMatch(/Handicaps locked/);
    expect(t).not.toMatch(/Next: hole/);
  });
});

import { roundGroups } from "../src/lib/signOff.js";
import { groupList } from "../src/lib/pairings.js";

describe("players the pairings left out", () => {
  it("get a group button of their own, so their cards can be entered", () => {
    store["pocono:onCourse"] = "0";
    const paired = groupList(archive.event.pairings, 1).filter((g) => g.length).length;
    const all = roundGroups(archive.event, 1).length;
    expect(all).toBe(paired + 1);
    expect(render()).toMatch(new RegExp(`Group ${all}`));
  });
});
