// ── Signing the card ─────────────────────────────────────────────────────────
// In a real tournament nobody's score counts until the card is checked and
// signed. Here, once a group's card is complete, someone in the group signs
// it. If a score on that card changes afterwards the signature no longer
// matches and the card needs signing again — so "I had a 5 there, not a 6"
// gets settled before the money moves, not after.
//
// Weekends created from now on ask for it (`requireSignOff`). Pocono 2026
// never did, and nothing about it changes.
import { groupList } from "./pairings.js";

/** A group is the same group whatever order its players are listed in. */
export function groupKey(ids) {
  return [...ids].map(String).sort().join("-");
}

/** A short fingerprint of the group's cards, to tell if they've changed since signing. */
export function cardFingerprint(scores, ids) {
  const text = [...ids].map(String).sort()
    .map((id) => `${id}:${((scores || {})[id] || []).map((n) => Number(n) || 0).join(",")}`).join("|");
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const full = (card) => (card || []).filter((n) => Number(n) > 0).length === 18;
const anyScore = (card) => (card || []).some((n) => Number(n) > 0);

/**
 * The groups that played a round — the pairings, or the whole field if there
 * were none. Anyone left out of the pairings is a group of their own: 2026's
 * round 1 paired eight of twelve, and four full cards that no group owned
 * would otherwise never be asked for a signature.
 */
export function roundGroups(event, roundId) {
  const groups = groupList(event?.pairings || {}, roundId).filter((g) => g && g.length);
  const all = (event?.players || []).map((p) => p.id);
  if (!groups.length) return all.length ? [all] : [];
  const paired = new Set(groups.flat().map(String));
  const left = all.filter((id) => !paired.has(String(id)));
  return left.length ? [...groups, left] : groups;
}

/** Where every group's card stands for one round. Groups with no scores are left out. */
export function signOffStatus(event, roundId) {
  const round = event?.rounds?.[roundId] || {};
  const scores = round.scores || {};
  const names = new Map((event?.players || []).map((p) => [String(p.id), p.name]));
  return roundGroups(event, roundId)
    .map((ids, index) => {
      const playing = ids.filter((id) => anyScore(scores[id]));
      const key = groupKey(ids);
      const sig = round.signOff?.[key] || null;
      const fp = cardFingerprint(scores, ids);
      return {
        roundId: Number(roundId),
        index,
        key,
        ids,
        names: ids.map((id) => names.get(String(id)) || "?"),
        started: playing.length > 0,
        complete: playing.length > 0 && playing.every((id) => full(scores[id])),
        signed: sig && sig.fp === fp ? sig : null,
        stale: !!sig && sig.fp !== fp,      // signed, then a score changed
      };
    })
    .filter((g) => g.started);
}

/** Everything still to sign across the weekend, and whether the money can be settled. */
export function weekendSignOff(event) {
  const required = !!event?.requireSignOff;
  const pending = [];
  for (const rid of Object.keys(event?.rounds || {})) {
    for (const g of signOffStatus(event, rid)) if (!g.signed) pending.push(g);
  }
  pending.sort((a, b) => a.roundId - b.roundId || a.index - b.index);
  return { required, pending, settled: !required || pending.length === 0 };
}

/** The field to write when someone signs a group's card. */
export function signFields(event, roundId, ids, byId, now = Date.now) {
  const scores = event?.rounds?.[roundId]?.scores || {};
  const by = (event?.players || []).find((p) => String(p.id) === String(byId));
  return {
    [`rounds.${roundId}.signOff.${groupKey(ids)}`]: {
      by: by ? by.id : byId, byName: by?.name || "?", at: now(), fp: cardFingerprint(scores, ids),
    },
  };
}

/** The field to write to take a signature back. */
export function unsignFields(roundId, ids) {
  return { [`rounds.${roundId}.signOff.${groupKey(ids)}`]: null };
}

/** "Round 3 · Dan, JC, Scott" — for the waiting list. */
export function describeGroup(g) {
  return `Round ${g.roundId} · ${g.names.join(", ")}`;
}
