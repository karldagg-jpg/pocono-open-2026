import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { bankerPlan } from "../src/lib/banker.js";
import { venmoRequestLink } from "../src/lib/venmo.js";
import { settleWeekend } from "../src/lib/settlement.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const players = archive.event.players.map((p) =>
  p.name === "Steve" ? { ...p, venmo: "Steve-Smith-12" } : p.name === "Russ" ? { ...p, venmo: "Russ-R-55" } : p);
const event = { ...archive.event, players };
const rows = settleWeekend(event).rows;
const karl = players.find((p) => p.name === "Karl").id;
const plan = bankerPlan(rows, karl, { note: "Pocono Open 2026" });
const line = (name) => plan.lines.find((l) => l.player.name === name);

describe("bankerPlan — Karl holds the money", () => {
  it("has one line for every player but the bank", () => {
    expect(plan.banker.name).toBe("Karl");
    expect(plan.lines).toHaveLength(players.length - 1);
    expect(plan.lines.some((l) => l.player.name === "Karl")).toBe(false);
  });

  it("pays a winner what they won — the buy-in is already in the bank", () => {
    // Steve won $297 in all (pots plus birdie pool) on a $100 buy-in.
    expect(line("Steve")).toMatchObject({ kind: "pay", amount: 297 });
    expect(line("Steve").link).toBe("https://venmo.com/Steve-Smith-12?txn=pay&amount=297.00&note=Pocono+Open+2026");
  });

  it("asks for money from someone who ended up owing", () => {
    // Russ: no winnings, $28 down in the birdie pool.
    expect(line("Russ")).toMatchObject({ kind: "request", amount: 28 });
    expect(line("Russ").link).toContain("txn=charge");
    expect(line("Russ").link).toContain("amount=28.00");
  });

  it("has no link for someone without a username", () => {
    expect(line("Jake").link).toBeNull();
    expect(line("Jake").kind).toBe("pay");
  });

  it("balances: the bank keeps the buy-ins less what it pays, plus what it collects", () => {
    const won = (name) => rows.find((r) => r.player.name === name).won;
    const others = rows.filter((r) => r.player.name !== "Karl");
    const expectedKeeps = plan.totals.collected - others.reduce((t, r) => t + r.won, 0);
    expect(plan.totals.keeps).toBe(expectedKeeps);
    // And the bank ends with Karl's own winnings plus the money no pot paid out.
    const s = settleWeekend(event);
    expect(plan.totals.keeps).toBe(won("Karl") + s.totals.unallocated - s.totals.payoutDrift);
  });

  it("lists payments, then collections", () => {
    const kinds = plan.lines.map((l) => l.kind);
    expect(kinds.indexOf("request")).toBeGreaterThan(kinds.lastIndexOf("pay"));
  });

  it("counts what's been done", () => {
    const ticked = bankerPlan(rows, karl, { paid: { [line("Steve").key]: { at: 1 } } });
    expect(ticked.done).toBe(1);
    expect(ticked.toDo).toBe(plan.lines.filter((l) => l.kind !== "square").length);
  });

  it("changes the tick's key if the amount changes, so a stale tick doesn't count", () => {
    const moved = rows.map((r) => (r.player.name === "Steve" ? { ...r, won: r.won + 5 } : r));
    expect(bankerPlan(moved, karl).lines.find((l) => l.player.name === "Steve").key).not.toBe(line("Steve").key);
  });
});

describe("venmoRequestLink", () => {
  it("asks rather than pays", () => {
    expect(venmoRequestLink("Russ-R-55", 28, "x")).toBe("https://venmo.com/Russ-R-55?txn=charge&amount=28.00&note=x");
    expect(venmoRequestLink("", 28)).toBeNull();
  });
});
