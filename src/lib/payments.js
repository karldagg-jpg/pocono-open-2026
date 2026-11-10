// ── Who pays whom, and what's been paid ──────────────────────────────────────
// The settle-up list with a tick per payment, so the money can be checked off
// as it changes hands. The app never moves money itself.

/** Whole cents, never negative. */
const cents = (amount) => Math.max(0, Math.round((Number(amount) || 0) * 100)) / 100;

/** Stable key for one payment, so it can be ticked off. Changes if the amount does. */
export function paymentKey(t) {
  return `${t.fromId}_${t.toId}_${Math.round(cents(t.amount) * 100)}`;
}

/** The settle-up list, each line with its key and whether it's been ticked. */
export function paymentPlan(transfers, { paid = {} } = {}) {
  return (transfers || []).map((t) => {
    const key = paymentKey(t);
    return { ...t, key, paid: !!paid?.[key] };
  });
}

/** How the settle-up stands: "3 of 7 paid". */
export function paidSummary(plan) {
  const done = plan.filter((p) => p.paid).length;
  return { done, total: plan.length, allPaid: plan.length > 0 && done === plan.length };
}
