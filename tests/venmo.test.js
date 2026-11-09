import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { normalizeHandle, venmoPayLink, paymentKey, paymentPlan, paidSummary } from "../src/lib/venmo.js";
import { settleWeekend, settlementTransfers } from "../src/lib/settlement.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));

describe("normalizeHandle", () => {
  it("accepts a plain username", () => {
    expect(normalizeHandle("Karl-Dagg")).toEqual({ handle: "Karl-Dagg", error: null });
  });

  it("strips the @ people type out of habit", () => {
    expect(normalizeHandle(" @Karl-Dagg ").handle).toBe("Karl-Dagg");
  });

  it("pulls the username out of a pasted profile link", () => {
    for (const s of ["venmo.com/u/Karl-Dagg", "https://venmo.com/Karl-Dagg", "https://account.venmo.com/u/Karl-Dagg?x=1", "www.venmo.com/u/Karl-Dagg/"]) {
      expect(normalizeHandle(s)).toEqual({ handle: "Karl-Dagg", error: null });
    }
  });

  it("allows blank — not everyone has given theirs yet", () => {
    expect(normalizeHandle("")).toEqual({ handle: "", error: null });
    expect(normalizeHandle(undefined).error).toBeNull();
  });

  it("refuses something that can't be a username", () => {
    expect(normalizeHandle("abc").error).toMatch(/5 to 30/);
    expect(normalizeHandle("karl dagg").error).toBeTruthy();
    expect(normalizeHandle("karl.dagg").error).toBeTruthy();
    expect(normalizeHandle("x".repeat(31)).error).toBeTruthy();
  });

  it("refuses an attempt to smuggle a different link through", () => {
    expect(normalizeHandle("evil.example.com/Karl-Dagg").error).toBeTruthy();
    expect(normalizeHandle("javascript:alert(1)").error).toBeTruthy();
  });
});

describe("venmoPayLink", () => {
  it("opens Venmo to pay that person that amount", () => {
    expect(venmoPayLink("Karl-Dagg", 47, "Pocono Open 2026")).toBe(
      "https://venmo.com/Karl-Dagg?txn=pay&amount=47.00&note=Pocono+Open+2026",
    );
  });

  it("rounds to cents", () => {
    expect(venmoPayLink("Karl-Dagg", 12.345)).toContain("amount=12.35");
  });

  it("always points at venmo.com, whatever was typed", () => {
    expect(venmoPayLink("@Karl-Dagg", 5).startsWith("https://venmo.com/Karl-Dagg?")).toBe(true);
  });

  it("gives no link for nothing to pay, no username, or a bad one", () => {
    expect(venmoPayLink("Karl-Dagg", 0)).toBeNull();
    expect(venmoPayLink("Karl-Dagg", -5)).toBeNull();
    expect(venmoPayLink("", 5)).toBeNull();
    expect(venmoPayLink("no", 5)).toBeNull();
  });
});

describe("paymentKey", () => {
  it("is stable for the same payment and changes with the amount", () => {
    const t = { fromId: 1, toId: 2, amount: 47 };
    expect(paymentKey(t)).toBe("1_2_4700");
    expect(paymentKey({ ...t, amount: 48 })).not.toBe(paymentKey(t));
  });

  it("uses only characters safe in a database field name", () => {
    expect(paymentKey({ fromId: 1779124961601, toId: 1779124952633, amount: 12.5 })).toMatch(/^[0-9_]+$/);
  });
});

describe("paymentPlan — the real 2026 settle-up", () => {
  const players = archive.event.players.map((p) => (p.name === "Steve" ? { ...p, venmo: "@Steve-Smith-12" } : p));
  const transfers = settlementTransfers(settleWeekend(archive.event).rows);

  it("links every payment to someone with a username, and only those", () => {
    const plan = paymentPlan(transfers, players, { note: "Pocono Open 2026" });
    for (const p of plan) {
      if (p.to === "Steve") {
        expect(p.handle).toBe("Steve-Smith-12");
        expect(p.link).toContain("https://venmo.com/Steve-Smith-12?");
        expect(p.link).toContain(`amount=${p.amount}.00`);
      } else {
        expect(p.link).toBeNull();
      }
    }
    expect(plan.some((p) => p.to === "Steve")).toBe(true);
  });

  it("marks what's been paid and counts it", () => {
    const first = paymentPlan(transfers, players)[0];
    const plan = paymentPlan(transfers, players, { paid: { [first.key]: { at: 1 } } });
    expect(plan[0].paid).toBe(true);
    expect(paidSummary(plan)).toEqual({ done: 1, total: transfers.length, allPaid: false });
  });

  it("is all paid only when every payment is ticked", () => {
    const keys = Object.fromEntries(paymentPlan(transfers, players).map((p) => [p.key, true]));
    expect(paidSummary(paymentPlan(transfers, players, { paid: keys })).allPaid).toBe(true);
    expect(paidSummary([]).allPaid).toBe(false);
  });
});
