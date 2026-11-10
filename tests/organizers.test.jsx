import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import fs from "fs";
import path from "path";
import { isOrganizer, signInRequired, looksLikeEmail, ORGANIZERS } from "../src/lib/organizers.js";
import WinningsScreen from "../src/components/WinningsScreen.jsx";
import ScoringScreen from "../src/components/ScoringScreen.jsx";
import GamesScreen from "../src/components/GamesScreen.jsx";
import OrganizerSignIn from "../src/components/OrganizerSignIn.jsx";
import { signOffStatus, signFields } from "../src/lib/signOff.js";
import { applyFields } from "../src/lib/fieldPatch.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const LIB = archive.library;
const noop = () => {};
beforeEach(() => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: () => {} };
});
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("isOrganizer", () => {
  const list = ["Karl@Example.com"];
  it("knows a signed-in organizer, whatever the capitals", () => {
    expect(isOrganizer({ email: "karl@example.com", emailVerified: true, isAnonymous: false }, list)).toBe(true);
  });

  it("never treats an anonymous golfer as an organizer", () => {
    expect(isOrganizer({ isAnonymous: true, email: "karl@example.com" }, list)).toBe(false);
    expect(isOrganizer(null, list)).toBe(false);
  });

  it("refuses an email that isn't on the list, or isn't verified", () => {
    expect(isOrganizer({ email: "steve@example.com", emailVerified: true }, list)).toBe(false);
    expect(isOrganizer({ email: "karl@example.com", emailVerified: false }, list)).toBe(false);
  });

  it("keeps the PIN in charge until there's an organizer to sign in", () => {
    expect(signInRequired([])).toBe(false);
    expect(signInRequired(list)).toBe(true);
    expect(signInRequired()).toBe(ORGANIZERS.length > 0);
  });

  it("checks an email looks like one before sending a link", () => {
    expect(looksLikeEmail("karl@example.com")).toBe(true);
    expect(looksLikeEmail("karl")).toBe(false);
  });
});

// 2026 replayed with Karl holding the money and every card signed.
function bankWeekend() {
  let e = JSON.parse(JSON.stringify(archive.event));
  e.banker = e.players.find((p) => p.name === "Karl").id;
  e.requireSignOff = true;
  for (const r of Object.keys(e.rounds)) for (const g of signOffStatus(e, r)) e = applyFields(e, signFields(e, r, g.ids, g.ids[0], () => 1));
  return e;
}

describe("settling up with the bank", () => {
  it("lets the bank tick lines off as they're settled", () => {
    const html = renderToStaticMarkup(<WinningsScreen event={bankWeekend()} library={LIB} saveEvent={noop} canAct />);
    expect(html).toMatch(/aria-label="Paid Steve"/);
    expect(html).toMatch(/aria-label="Collected from Russ"/);
    expect(html).not.toMatch(/venmo/i);
  });

  it("shows everyone else the amounts, with nothing to tick", () => {
    const t = text(<WinningsScreen event={bankWeekend()} library={LIB} saveEvent={noop} canAct={false} />);
    expect(t).toMatch(/Karl pays Steve \$297/);
    expect(t).toMatch(/Russ pays Karl \$28/);
    expect(renderToStaticMarkup(<WinningsScreen event={bankWeekend()} library={LIB} saveEvent={noop} canAct={false} />)).not.toMatch(/type="checkbox"/);
  });

  it("says what the bank holds and is left with", () => {
    expect(text(<WinningsScreen event={bankWeekend()} library={LIB} saveEvent={noop} canAct />))
      // $1,200 in, $873 out, $46 back: $373 left — Karl's own $274 plus the
      // $100 no pot paid out, less $1 of scat rounding.
      .toMatch(/Karl holds the \$1,200 in buy-ins: pays out \$873, collects \$46, and is left with \$373\./);
  });

  it("goes back to players paying each other with nobody holding the money", () => {
    const e = { ...bankWeekend(), banker: null };
    const t = text(<WinningsScreen event={e} library={LIB} saveEvent={noop} canAct />);
    expect(t).toMatch(/who pays whom/);
    expect(t).not.toMatch(/settling up with/);
  });
});

describe("organizer-only controls", () => {
  it("hides Lock round from golfers", () => {
    const e = JSON.parse(JSON.stringify(archive.event));
    const html = (canLock) => renderToStaticMarkup(<ScoringScreen event={e} library={LIB} saveEvent={noop} canLock={canLock} />);
    expect(html(true)).toMatch(/>Unlock</);
    expect(html(false)).not.toMatch(/>Unlock</);
    expect(html(false)).toMatch(/Handicaps locked/);   // the state still shows
  });

  it("lets the organizer pick who holds the money", () => {
    const t = text(<GamesScreen event={bankWeekend()} library={LIB} saveEvent={noop} />);
    expect(t).toMatch(/Who's holding the money\?/);
    expect(renderToStaticMarkup(<GamesScreen event={bankWeekend()} library={LIB} saveEvent={noop} />))
      .toMatch(new RegExp(`<option value="${bankWeekend().banker}" selected="">Karl</option>`));
  });

  it("explains sign-in is for organizers, not golfers", () => {
    const t = text(<OrganizerSignIn />);
    expect(t).toMatch(/Organizer sign-in/);
    expect(t).toMatch(/Scores, the board and signing cards don't need it/);
    expect(t).toMatch(/Email me a sign-in link/);
  });
});

describe("App wiring", () => {
  const APP = fs.readFileSync(path.join(process.cwd(), "src/App.jsx"), "utf8");
  it("puts only the setup screens behind organizer sign-in — never Scoring", () => {
    expect(APP).toMatch(/needsOrganizer = gated && !organizer && \(GET_READY\.includes\(screen\)/);
    expect(APP).toMatch(/const GET_READY = \["setup", "courses", "games", "pairings"\]/);
  });

  it("keeps the PIN only while nobody can sign in as an organizer", () => {
    expect(APP).toMatch(/needsPin = !gated && eventPin/);
  });
});
