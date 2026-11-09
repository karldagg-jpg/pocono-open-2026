import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  groupKey, cardFingerprint, roundGroups, signOffStatus, weekendSignOff,
  signFields, unsignFields, describeGroup,
} from "../src/lib/signOff.js";
import { applyFields } from "../src/lib/fieldPatch.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const POCONO = archive.event;

const card = (n) => Array(18).fill(n);
const players = [1, 2, 3, 4, 5, 6].map((id) => ({ id, name: `P${id}` }));
function weekend(over = {}) {
  return {
    requireSignOff: true,
    players,
    pairings: { 1: { 0: [1, 2, 3], 1: [4, 5, 6] } },
    rounds: { 1: { courseId: "c", scores: { 1: card(4), 2: card(5), 3: card(6), 4: card(4), 5: card(4), 6: card(4) } } },
    ...over,
  };
}

describe("groupKey and cardFingerprint", () => {
  it("names a group the same whatever the order", () => {
    expect(groupKey([3, 1, 2])).toBe(groupKey([1, 2, 3]));
  });

  it("fingerprints the same cards the same, and changes with any score", () => {
    const s = { 1: card(4), 2: card(5) };
    expect(cardFingerprint(s, [2, 1])).toBe(cardFingerprint(s, [1, 2]));
    const changed = { ...s, 2: [...card(5)] }; changed[2][17] = 6;
    expect(cardFingerprint(changed, [1, 2])).not.toBe(cardFingerprint(s, [1, 2]));
  });
});

describe("roundGroups", () => {
  it("uses the pairings", () => {
    expect(roundGroups(weekend(), 1)).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it("treats an unpaired round as one group", () => {
    expect(roundGroups(weekend({ pairings: {} }), 1)).toEqual([[1, 2, 3, 4, 5, 6]]);
  });

  it("puts players left out of the pairings in a group of their own", () => {
    expect(roundGroups(weekend({ pairings: { 1: { 0: [1, 2, 3] } } }), 1)).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it("won't settle the money while a left-out player's card is unsigned", () => {
    let e = weekend({ pairings: { 1: { 0: [1, 2, 3] } } });
    e = applyFields(e, signFields(e, 1, [1, 2, 3], 1));
    const w = weekendSignOff(e);
    expect(w.settled).toBe(false);
    expect(w.pending.map(describeGroup)).toEqual(["Round 1 · P4, P5, P6"]);
  });

  it("covers every card in the real 2026 weekend", () => {
    // Round 1 paired 8 of 12; the other four still need to be someone's card.
    const ids = roundGroups(POCONO, 1).flat().map(String).sort();
    expect(ids).toEqual(POCONO.players.map((p) => String(p.id)).sort());
  });
});

describe("signOffStatus", () => {
  it("knows a finished card that nobody has signed", () => {
    const g = signOffStatus(weekend(), 1);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ complete: true, signed: null, stale: false, names: ["P1", "P2", "P3"] });
  });

  it("isn't complete with a hole missing", () => {
    const e = weekend(); e.rounds[1].scores[2] = [...card(5)]; e.rounds[1].scores[2][9] = 0;
    expect(signOffStatus(e, 1)[0].complete).toBe(false);
  });

  it("ignores a player in the group with no card at all — like Russ", () => {
    const e = weekend(); delete e.rounds[1].scores[3];
    expect(signOffStatus(e, 1)[0].complete).toBe(true);
  });

  it("leaves out groups that haven't started", () => {
    const e = weekend(); for (const id of [4, 5, 6]) delete e.rounds[1].scores[id];
    expect(signOffStatus(e, 1)).toHaveLength(1);
  });

  it("shows a signature that still matches the card", () => {
    const e = applyFields(weekend(), signFields(weekend(), 1, [1, 2, 3], 2, () => 42));
    expect(signOffStatus(e, 1)[0].signed).toMatchObject({ byName: "P2", at: 42 });
  });

  it("drops a signature when a score changes afterwards", () => {
    let e = applyFields(weekend(), signFields(weekend(), 1, [1, 2, 3], 2));
    e = applyFields(e, { "rounds.1.scores.1": [...card(4).slice(0, 17), 5] });
    const g = signOffStatus(e, 1)[0];
    expect(g.signed).toBeNull();
    expect(g.stale).toBe(true);
  });

  it("can take a signature back", () => {
    let e = applyFields(weekend(), signFields(weekend(), 1, [1, 2, 3], 2));
    e = applyFields(e, unsignFields(1, [3, 2, 1]));
    expect(signOffStatus(e, 1)[0]).toMatchObject({ signed: null, stale: false });
  });
});

describe("weekendSignOff", () => {
  it("lists every unsigned card in order", () => {
    const w = weekendSignOff(weekend());
    expect(w.required).toBe(true);
    expect(w.settled).toBe(false);
    expect(w.pending.map(describeGroup)).toEqual(["Round 1 · P1, P2, P3", "Round 1 · P4, P5, P6"]);
  });

  it("is settled once every card is signed", () => {
    let e = weekend();
    e = applyFields(e, signFields(e, 1, [1, 2, 3], 1));
    e = applyFields(e, signFields(e, 1, [4, 5, 6], 4));
    expect(weekendSignOff(e)).toMatchObject({ settled: true, pending: [] });
  });

  it("doesn't hold up a weekend that never asked for it — 2026 is untouched", () => {
    const w = weekendSignOff(POCONO);
    expect(w.required).toBe(false);
    expect(w.settled).toBe(true);
  });
});

describe("signFields", () => {
  it("writes one field for the group, with who and when", () => {
    const f = signFields(weekend(), 1, [3, 1, 2], 1, () => 7);
    expect(Object.keys(f)).toEqual(["rounds.1.signOff.1-2-3"]);
    expect(f["rounds.1.signOff.1-2-3"]).toMatchObject({ by: 1, byName: "P1", at: 7 });
  });
});
