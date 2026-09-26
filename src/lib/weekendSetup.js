// ── Getting a weekend ready ───────────────────────────────────────────────────
// Setting one up is a handful of separate jobs — field, courses, pots, groups —
// and the ones you forget don't announce themselves. They turn up on the first
// tee, or worse, in the settlement afterwards.
//
// The 2026 weekend collected $1,200 against $1,100 of configured pots and
// nobody noticed until the money was being counted. That check belongs here,
// before anyone tees off, not in the report afterwards.
import { balancedGroupSizes, groupsNeeded, groupList } from "./pairings.js";
import { totalPots } from "./settlement.js";
import { lockStatus } from "./handicapLock.js";

export const MISSING = "missing";
export const WARN = "warn";
export const OK = "ok";

/** Players with no handicap index — they'd play off scratch without noticing. */
export function playersWithoutIndex(event) {
  return (event?.players || []).filter(
    (p) => p.hcpIndex == null || p.hcpIndex === "" || !Number.isFinite(Number(p.hcpIndex))
  );
}

/** Rounds with no course assigned — nothing scores until these are set. */
export function roundsWithoutCourse(event, courses = {}) {
  const out = [];
  for (const id of Object.keys(event?.rounds || {}).sort()) {
    const cid = event.rounds[id]?.courseId;
    if (!cid || !courses[cid]) out.push(id);
  }
  return out;
}

/**
 * Does the money add up?
 *
 * Buy-ins fund the pots. If they don't match, someone is either short or
 * holding money that no game pays out — which is exactly what happened in 2026.
 */
export function potBalance(event) {
  const players = (event?.players || []).length;
  const buyIn = Number(event?.weekendBuyIn ?? event?.buyIn ?? 0) || 0;
  const collected = players * buyIn;
  const pots = totalPots(event).total;
  return { players, buyIn, collected, pots, gap: collected - pots, balanced: collected === pots };
}

/**
 * Suggested pot amounts for a field of this size, keeping the shares that are
 * already configured. Returns what each pot would become so the money balances.
 */
export function suggestPots(event, { players = null } = {}) {
  const n = players ?? (event?.players || []).length;
  const buyIn = Number(event?.weekendBuyIn ?? event?.buyIn ?? 0) || 0;
  const target = n * buyIn;
  const cur = totalPots(event);
  if (!target || !cur.total) return null;
  const scale = target / cur.total;
  const out = {
    scatts: Math.round(cur.scatts * scale),
    lowNet: Math.round(cur.lowNet * scale),
    ctp: Math.round(cur.ctp * scale),
    hio: Math.round(cur.hio * scale),
  };
  // Rounding each pot on its own lands a dollar or two off the target, and a
  // suggestion that doesn't balance is no use — it's the whole point. Push the
  // remainder into the largest pot, where it's least noticeable.
  const drift = target - (out.scatts + out.lowNet + out.ctp + out.hio);
  if (drift) {
    const biggest = ["scatts", "lowNet", "hio", "ctp"].reduce((a, b) => (out[b] > out[a] ? b : a));
    out[biggest] += drift;
  }
  return { target, ...out };
}

/** How the field divides into groups, and whether the pairings match. */
export function groupPlan(event, roundId, groupSize = 4) {
  const n = (event?.players || []).length;
  const sizes = balancedGroupSizes(n, groupSize);
  const existing = groupList(event?.pairings || {}, roundId);
  const assigned = existing.reduce((t, g) => t + (g || []).length, 0);
  return {
    players: n,
    needed: groupsNeeded(n, groupSize),
    sizes,
    made: existing.length,
    assigned,
    complete: n > 0 && assigned === n,
  };
}

/**
 * Everything standing between this weekend and the first tee.
 *
 * `missing` stops play; `warn` is worth knowing but won't break anything. The
 * list is ordered the way you'd work through it, not by severity.
 */
export function weekendReadiness(event, courses = {}, { expectedPlayers = null, groupSize = 4 } = {}) {
  const items = [];
  const players = (event?.players || []).length;
  const rounds = Object.keys(event?.rounds || {});

  if (!players) {
    items.push({ id: "players", level: MISSING, label: "Add the field", detail: "Nobody on the roster yet." });
  } else if (expectedPlayers && players !== expectedPlayers) {
    items.push({
      id: "players", level: WARN, label: `${players} of ${expectedPlayers} players`,
      detail: players < expectedPlayers
        ? `${expectedPlayers - players} still to add.`
        : `${players - expectedPlayers} more than expected.`,
    });
  } else {
    items.push({ id: "players", level: OK, label: `${players} players`, detail: "Field is set." });
  }

  const noIdx = playersWithoutIndex(event);
  if (noIdx.length) {
    items.push({
      id: "indexes", level: MISSING, label: "Handicap indexes missing",
      detail: `${noIdx.map((p) => p.name).join(", ")} would play off scratch.`,
    });
  }

  if (!rounds.length) {
    items.push({ id: "rounds", level: MISSING, label: "No rounds", detail: "Add the rounds you're playing." });
  } else {
    const noCourse = roundsWithoutCourse(event, courses);
    if (noCourse.length) {
      items.push({
        id: "courses", level: MISSING, label: `Course not set for round ${noCourse.join(", ")}`,
        detail: "Nothing scores until each round has a course with par and stroke index.",
      });
    } else {
      items.push({ id: "courses", level: OK, label: `${rounds.length} rounds, courses set`, detail: "" });
    }
  }

  const bal = potBalance(event);
  if (!bal.buyIn) {
    items.push({ id: "buyin", level: MISSING, label: "No buy-in set", detail: "Nothing to collect." });
  } else if (!bal.balanced) {
    items.push({
      id: "pots", level: WARN,
      label: `Pots are ${bal.gap > 0 ? "short by" : "over by"} $${Math.abs(bal.gap)}`,
      detail: `${bal.players} × $${bal.buyIn} = $${bal.collected} collected, $${bal.pots} in the pots.`,
    });
  } else {
    items.push({ id: "pots", level: OK, label: `$${bal.collected} in, $${bal.pots} in pots`, detail: "Money balances." });
  }

  for (const id of rounds.sort()) {
    const plan = groupPlan(event, id, groupSize);
    if (!plan.complete && players) {
      items.push({
        id: `pairings-${id}`, level: WARN, label: `Round ${id} groups incomplete`,
        detail: `${plan.assigned} of ${plan.players} paired — ${plan.needed} groups of ${plan.sizes.join("/")}.`,
      });
    }
  }

  const locked = rounds.filter((id) => lockStatus(event, id).locked);
  if (locked.length) {
    items.push({
      id: "locked", level: WARN, label: `Round ${locked.join(", ")} handicaps locked`,
      detail: "Unlock before play if anyone's index still needs changing.",
    });
  }

  return {
    items,
    blockers: items.filter((i) => i.level === MISSING),
    warnings: items.filter((i) => i.level === WARN),
    ready: !items.some((i) => i.level === MISSING),
  };
}
