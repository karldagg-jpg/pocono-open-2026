import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { paymentKey, paymentPlan, paidSummary } from "../src/lib/payments.js";
import { settleWeekend, settlementTransfers } from "../src/lib/settlement.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const transfers = settlementTransfers(settleWeekend(archive.event).rows);

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
  it("carries every payment through, nothing ticked yet", () => {
    const plan = paymentPlan(transfers);
    expect(plan).toHaveLength(transfers.length);
    expect(plan.every((p) => !p.paid)).toBe(true);
  });

  it("marks what's been paid and counts it", () => {
    const first = paymentPlan(transfers)[0];
    const plan = paymentPlan(transfers, { paid: { [first.key]: { at: 1 } } });
    expect(plan[0].paid).toBe(true);
    expect(paidSummary(plan)).toEqual({ done: 1, total: transfers.length, allPaid: false });
  });

  it("is all paid only when every payment is ticked", () => {
    const keys = Object.fromEntries(paymentPlan(transfers).map((p) => [p.key, true]));
    expect(paidSummary(paymentPlan(transfers, { paid: keys })).allPaid).toBe(true);
    expect(paidSummary([]).allPaid).toBe(false);
  });

  it("has nothing to do with payment apps", () => {
    for (const p of paymentPlan(transfers)) {
      expect(p).not.toHaveProperty("link");
      expect(p).not.toHaveProperty("handle");
    }
  });
});
