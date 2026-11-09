// ── Paying up on Venmo ───────────────────────────────────────────────────────
// The app never touches money, cards or anyone's login. A Pay button opens
// Venmo with the person and amount filled in; the payer checks the name and
// photo Venmo shows and confirms there, on their own account.
//
// The one thing worth protecting is the username: send to the wrong one and
// the money goes to the wrong person. So usernames are checked when entered,
// shown on the button itself, and the settle-up records exactly who was paid.

// Venmo usernames: 5–30 characters, letters, numbers, hyphens and underscores.
const HANDLE = /^[A-Za-z0-9_-]{5,30}$/;

/**
 * Tidy what someone typed or pasted — "@Karl-Dagg", "venmo.com/u/Karl-Dagg",
 * "https://account.venmo.com/u/Karl-Dagg" — down to the username.
 * → { handle, error }
 */
export function normalizeHandle(input) {
  let s = String(input ?? "").trim();
  if (!s) return { handle: "", error: null };          // blank is allowed: no Venmo yet
  s = s.replace(/^https?:\/\//i, "").replace(/^(www\.|account\.)?venmo\.com\/(u\/)?/i, "");
  s = s.split(/[/?#]/)[0].replace(/^@/, "");
  if (!HANDLE.test(s)) {
    return { handle: s, error: "A Venmo username is 5 to 30 letters, numbers, - or _ — as it appears after the @." };
  }
  return { handle: s, error: null };
}

/** Whole cents, never negative. */
const cents = (amount) => Math.max(0, Math.round((Number(amount) || 0) * 100)) / 100;

/** A link that opens Venmo to pay someone. Null if there's no one or nothing to pay. */
export function venmoPayLink(handle, amount, note = "") {
  const h = normalizeHandle(handle);
  const amt = cents(amount);
  if (!h.handle || h.error || amt <= 0) return null;
  const q = new URLSearchParams({ txn: "pay", amount: amt.toFixed(2), note });
  return `https://venmo.com/${encodeURIComponent(h.handle)}?${q.toString()}`;
}

/** A link that opens Venmo to request money from someone. */
export function venmoRequestLink(handle, amount, note = "") {
  const pay = venmoPayLink(handle, amount, note);
  return pay ? pay.replace("txn=pay", "txn=charge") : null;
}

/** Stable key for one payment, so "paid" can be ticked off. Changes if the amount does. */
export function paymentKey(t) {
  return `${t.fromId}_${t.toId}_${Math.round(cents(t.amount) * 100)}`;
}

/**
 * The settle-up list with everything a screen needs: the link, who's missing a
 * username, and whether it's been marked paid.
 */
export function paymentPlan(transfers, players, { note = "", paid = {} } = {}) {
  const byId = new Map((players || []).map((p) => [String(p.id), p]));
  return (transfers || []).map((t) => {
    const to = byId.get(String(t.toId));
    const handle = to?.venmo ? normalizeHandle(to.venmo).handle : "";
    const key = paymentKey(t);
    return {
      ...t,
      key,
      handle: handle || null,
      link: handle ? venmoPayLink(handle, t.amount, note) : null,
      paid: !!paid?.[key],
    };
  });
}

/** How the settle-up stands: "3 of 7 paid". */
export function paidSummary(plan) {
  const done = plan.filter((p) => p.paid).length;
  return { done, total: plan.length, allPaid: plan.length > 0 && done === plan.length };
}
