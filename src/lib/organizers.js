// ── Who runs the weekend ─────────────────────────────────────────────────────
// Organizers sign in by email and are the only ones who can change the setup —
// players, pots, courses, pairings — or tick off the settle-up. Golfers never
// sign in; anyone with the link can still score, record closest to the pin and
// sign cards.
//
// The database enforces the same list (firestore.rules, in the PVGC repo,
// which holds the rules for the shared Firebase project). Keep them in step.
//
// While this list is empty the app behaves as it always has (the PIN guards
// setup), so nobody is locked out before the first organizer can sign in.
export const ORGANIZERS = [];

const norm = (e) => String(e || "").trim().toLowerCase();

/** A signed-in organizer: a verified email on the list — never an anonymous golfer. */
export function isOrganizer(user, list = ORGANIZERS) {
  if (!user || user.isAnonymous || !user.email || user.emailVerified === false) return false;
  return list.map(norm).includes(norm(user.email));
}

/** Organizer sign-in replaces the PIN once there's someone on the list. */
export function signInRequired(list = ORGANIZERS) {
  return list.length > 0;
}

/** A sensible check before sending a link — the full test is the email itself. */
export function looksLikeEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}
