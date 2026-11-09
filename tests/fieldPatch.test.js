import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { applyFields, fieldsUnder, ctpResultFields, ctpClearFields, gamesSettingsFields } from "../src/lib/fieldPatch.js";
import { calcCTP } from "../src/lib/golfLogic.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));

describe("applyFields", () => {
  it("sets a value deep inside, creating what's missing", () => {
    expect(applyFields({}, { "games.ctp.results.2.6": 7 })).toEqual({ games: { ctp: { results: { 2: { 6: 7 } } } } });
  });

  it("leaves everything else alone — the whole point", () => {
    const ev = { games: { ctp: { results: { 1: { 2: 5 } }, pot: 50 }, lowNet: { pot: 500 } }, players: [1] };
    const out = applyFields(ev, { "games.ctp.results.2.6": 7 });
    expect(out.games.ctp.results).toEqual({ 1: { 2: 5 }, 2: { 6: 7 } });
    expect(out.games.ctp.pot).toBe(50);
    expect(out.games.lowNet).toBe(ev.games.lowNet);   // untouched branches are shared, not copied
    expect(out.players).toBe(ev.players);
  });

  it("never changes the original", () => {
    const ev = { a: { b: 1 } };
    applyFields(ev, { "a.b": 2, "a.c": 3 });
    expect(ev).toEqual({ a: { b: 1 } });
  });

  it("applies several fields in order", () => {
    expect(applyFields({}, { "a.b": 1, "a.c": 2, d: 3 })).toEqual({ a: { b: 1, c: 2 }, d: 3 });
  });

  it("replaces an array or scalar in the way rather than merging into it", () => {
    expect(applyFields({ a: [1, 2] }, { "a.x": 1 })).toEqual({ a: { x: 1 } });
    expect(applyFields({ a: 5 }, { "a.x": 1 })).toEqual({ a: { x: 1 } });
  });

  it("removes a key when the value is undefined", () => {
    expect(applyFields({ a: { b: 1, c: 2 } }, { "a.b": undefined })).toEqual({ a: { c: 2 } });
  });

  it("does nothing with no fields", () => {
    const ev = { a: 1 };
    expect(applyFields(ev, {})).toBe(ev);
    expect(applyFields(ev, undefined)).toBe(ev);
  });
});

describe("fieldsUnder", () => {
  it("prefixes each key", () => {
    expect(fieldsUnder("sixies", { scores: {}, game: "back" })).toEqual({ "sixies.scores": {}, "sixies.game": "back" });
  });
});

describe("closest to the pin", () => {
  it("records one hole without touching another group's", () => {
    const ev = { games: { ctp: { results: { 1: { 2: 111 } }, distances: { 1: { 2: "4'02\"" } } } } };
    const out = applyFields(ev, ctpResultFields(1, 6, { winnerId: 222, distance: "8'10\"", log: [{ name: "Karl" }] }));
    expect(out.games.ctp.results[1]).toEqual({ 2: 111, 6: 222 });
    expect(out.games.ctp.distances[1][2]).toBe("4'02\"");
  });

  it("two groups saving different holes both survive, in either order", () => {
    // This is the bug: each used to write the whole block from its own copy.
    const start = { games: { ctp: { results: {} } } };
    const a = ctpResultFields(1, 2, { winnerId: 111 });
    const b = ctpResultFields(1, 6, { winnerId: 222 });
    const ab = applyFields(applyFields(start, a), b);
    const ba = applyFields(applyFields(start, b), a);
    expect(ab.games.ctp.results).toEqual({ 1: { 2: 111, 6: 222 } });
    expect(ba.games.ctp.results).toEqual(ab.games.ctp.results);
  });

  it("clears to a blank the payouts treat as no winner", () => {
    const players = [{ id: 1, name: "A" }, { id: 2, name: "B" }];
    const ev = applyFields(
      { players, games: { ctp: { pot: 100, results: { 1: { 2: 1, 6: 2 } } } } },
      ctpClearFields(1, 6),
    );
    expect(ev.games.ctp.results[1][6]).toBeNull();
    const r = calcCTP(ev);
    expect(r.payouts[1]).toBe(100);
    expect(r.payouts[2]).toBe(0);
  });
});

describe("gamesSettingsFields — the Games screen's save", () => {
  const games = { ...archive.event.games, ctp: { ...archive.event.games.ctp, results: { 1: { 2: 999 } } } };
  const settings = { games, useIndexHcp: true, birdiePool: { enabled: true, 1: true, 2: true, 3: true, 4: false }, weekendBuyIn: 100, optOuts: new Set([5]), birdieOptOuts: [] };

  it("never rewrites closest-to-the-pin results recorded on the course", () => {
    const f = gamesSettingsFields(settings);
    expect(Object.keys(f).some((k) => k.startsWith("games.ctp.results"))).toBe(false);
    expect(f).not.toHaveProperty("games");
    expect(f).not.toHaveProperty("games.ctp");
  });

  it("writes only the winners changed on the screen", () => {
    const f = gamesSettingsFields(settings, { "2.6": 7, "3.11": null });
    expect(f["games.ctp.results.2.6"]).toBe(7);
    expect(f["games.ctp.results.3.11"]).toBeNull();
  });

  it("keeps a fourth round's birdie-pool switch", () => {
    expect(gamesSettingsFields(settings)["games.birdiePool"][4]).toBe(false);
  });

  it("saves the settings themselves", () => {
    const f = gamesSettingsFields(settings);
    expect(f.weekendBuyIn).toBe(100);
    expect(f.optOuts).toEqual([5]);
    expect(f["games.lowNet"].pot).toBe(500);
    expect(f["games.ctp.holes"]).toEqual(archive.event.games.ctp.holes);
  });

  it("applied over a weekend with newer results, keeps those results", () => {
    const live = applyFields(archive.event, ctpResultFields(2, 6, { winnerId: 1779124952633 }));
    const after = applyFields(live, gamesSettingsFields(settings));
    expect(after.games.ctp.results[2][6]).toBe(1779124952633);
  });
});
