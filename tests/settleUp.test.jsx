import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import fs from "fs";
import path from "path";
import WinningsScreen from "../src/components/WinningsScreen.jsx";
import ScoringScreen from "../src/components/ScoringScreen.jsx";
import SetupScreen from "../src/components/SetupScreen.jsx";
import { signOffStatus, signFields } from "../src/lib/signOff.js";
import { applyFields } from "../src/lib/fieldPatch.js";
import { cloneWeekend } from "../src/lib/newWeekend.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const LIB = archive.library;
const noop = () => {};
let store;
beforeEach(() => {
  store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: () => {} };
});
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

// 2026 replayed as a live weekend that asks for signatures.
function liveWeekend() {
  const e = JSON.parse(JSON.stringify(archive.event));
  e.requireSignOff = true;
  return e;
}
function signEverything(e) {
  for (const r of Object.keys(e.rounds)) {
    for (const g of signOffStatus(e, r)) e = applyFields(e, signFields(e, r, g.ids, g.ids[0], () => 1));
  }
  return e;
}
const winnings = (e, extra = {}) => text(<WinningsScreen event={e} library={LIB} saveEvent={noop} weekendLabel="Pocono Open 2026" {...extra} />);

describe("settling up", () => {
  it("marks the amounts provisional and lists unsigned cards while any are unsigned", () => {
    expect(winnings(liveWeekend())).toMatch(/Provisional\. These amounts can still change — not every card is signed: Round 1 ·/);
  });

  it("drops the warning once every card is signed", () => {
    expect(winnings(signEverything(liveWeekend()))).not.toMatch(/Provisional/);
  });

  it("has no payment-app buttons or links", () => {
    const html = renderToStaticMarkup(<WinningsScreen event={signEverything(liveWeekend())} library={LIB} saveEvent={noop} />);
    expect(html).not.toMatch(/venmo/i);
    expect(html).not.toMatch(/<a /);
  });

  it("counts payments ticked off", () => {
    const e = signEverything(liveWeekend());
    const t0 = winnings(e);
    const total = Number(/0 of (\d+) paid/.exec(t0)[1]);
    expect(total).toBeGreaterThan(0);
  });

  it("shows 2026 as it was: no sign-off, no Pay buttons, list folded", () => {
    const t = winnings(archive.event, { archived: true });
    expect(t).not.toMatch(/Provisional/);
    expect(t).toMatch(/Show who pays whom · 0 of \d+ paid/);
  });
});

describe("signing the card on Scoring", () => {
  const scoring = (e) => text(<ScoringScreen event={e} library={LIB} saveEvent={noop} />);

  it("asks the group to sign a complete card", () => {
    expect(scoring(liveWeekend())).toMatch(/Card complete — sign it/);
  });

  it("shows who signed once it's signed", () => {
    expect(scoring(signEverything(liveWeekend()))).toMatch(/Card signed by \w+/);
  });

  it("says when the card changed after signing", () => {
    let e = signEverything(liveWeekend());
    // Someone in the group the screen opens on: round 1, the first group.
    const anyone = signOffStatus(e, 1)[0].ids.find((id) => e.rounds[1].scores[id]);
    const card = [...e.rounds[1].scores[anyone]]; card[0] += 1;
    e = applyFields(e, { [`rounds.1.scores.${anyone}`]: card });
    expect(scoring(e)).toMatch(/The card changed after it was signed/);
  });

  it("never asks on a weekend that didn't want it", () => {
    expect(scoring(archive.event)).not.toMatch(/sign it|Card signed/);
  });
});

describe("the Players tab", () => {
  it("asks only for a name and an index — no payment usernames", () => {
    const html = renderToStaticMarkup(<SetupScreen event={liveWeekend()} library={LIB} saveEvent={noop} authed setAdminPin={noop} />);
    expect(html).not.toMatch(/venmo/i);
    expect(html).toMatch(/placeholder="Player name"/);
  });
});

describe("new weekends ask for signatures", () => {
  it("is switched on by New Weekend", () => {
    expect(cloneWeekend(archive.event, { label: "Pinehurst" }).requireSignOff).toBe(true);
  });
});

describe("sharing the recap", () => {
  it("offers it once the weekend is finished", () => {
    expect(winnings(archive.event, { archived: true })).toMatch(/Share the recap/);
  });

  it("doesn't offer it mid-weekend", () => {
    const e = JSON.parse(JSON.stringify(archive.event));
    for (const s of Object.values(e.rounds[3].scores)) s[17] = 0;
    expect(winnings(e)).not.toMatch(/Share the recap/);
  });
});
