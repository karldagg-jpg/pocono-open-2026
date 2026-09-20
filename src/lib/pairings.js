// ── Groups ────────────────────────────────────────────────────────────────────
// Pairings are stored as { [roundId]: { [groupIndex]: [playerId, ...] } }.
// Both the scoring and pairings screens used to read groups 0, 1 and 2 by hand,
// which happened to work for 12 players in threes of four and silently lost the
// fourth group the moment the field grew. Everything here derives the group
// count from the data instead.

export const DEFAULT_GROUP_SIZE = 4;

/** Groups for a round, as a dense array — index 0..n with no holes. */
export function groupList(pairings, roundId) {
  const obj = (pairings || {})[roundId] || {};
  const keys = Object.keys(obj).map(Number).filter(n => !Number.isNaN(n));
  if (!keys.length) return [];
  const max = Math.max(...keys);
  return Array.from({ length: max + 1 }, (_, i) => obj[i] || []);
}

/** Back to the stored shape. */
export function toPairingsObject(groups) {
  const out = {};
  groups.forEach((g, i) => { out[i] = g; });
  return out;
}

/** How many groups a field needs — never fewer than one. */
export function groupsNeeded(playerCount, groupSize = DEFAULT_GROUP_SIZE) {
  if (playerCount <= 0) return 0;
  return Math.max(1, Math.ceil(playerCount / Math.max(1, groupSize)));
}

/** Every player id already in a group this round. */
export function assignedIds(pairings, roundId) {
  return new Set(groupList(pairings, roundId).flat());
}

/** Players not yet in a group. */
export function unassignedPlayers(players, pairings, roundId) {
  const taken = assignedIds(pairings, roundId);
  return (players || []).filter(p => !taken.has(p.id));
}

/** Remove a player from every group in a round. */
export function removeFromGroups(groups, playerId) {
  return groups.map(g => g.filter(id => id !== playerId));
}

/** Add a player to a group, taking them out of any other first. */
export function addToGroup(groups, groupIndex, playerId, groupSize = DEFAULT_GROUP_SIZE) {
  const cleaned = removeFromGroups(groups, playerId);
  while (cleaned.length <= groupIndex) cleaned.push([]);
  if (cleaned[groupIndex].length >= groupSize) return groups; // full, no change
  cleaned[groupIndex] = [...cleaned[groupIndex], playerId];
  return cleaned;
}

/**
 * Split a field into balanced groups.
 *
 * Balanced matters: 14 players in fours would otherwise leave a group of two
 * playing alone. Sizes are spread so they differ by at most one — 14 becomes
 * 4/4/3/3 rather than 4/4/4/2.
 */
export function balancedGroupSizes(playerCount, groupSize = DEFAULT_GROUP_SIZE) {
  const n = groupsNeeded(playerCount, groupSize);
  if (!n) return [];
  const base = Math.floor(playerCount / n);
  const extra = playerCount % n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Auto-pair a field. `order` decides who lands together:
 *   "snake"  — by handicap, strongest spread across groups (default)
 *   "listed" — in the order given
 *   "random" — shuffled, using the supplied rng for repeatability
 */
export function autoPair(players, { groupSize = DEFAULT_GROUP_SIZE, order = "snake", rng = Math.random } = {}) {
  const list = [...(players || [])];
  if (!list.length) return [];
  const sizes = balancedGroupSizes(list.length, groupSize);
  const groups = sizes.map(() => []);

  let queue;
  if (order === "random") {
    queue = [...list];
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  } else if (order === "snake") {
    queue = [...list].sort((a, b) => (a.hcpIndex ?? 99) - (b.hcpIndex ?? 99));
  } else {
    queue = [...list];
  }

  // Deal round-robin, reversing direction each pass so groups stay even in
  // strength rather than stacking the best players together.
  let gi = 0, dir = 1;
  for (const p of queue) {
    let guard = 0;
    while (groups[gi].length >= sizes[gi]) {
      gi += dir;
      if (gi >= groups.length) { gi = groups.length - 1; dir = -1; }
      if (gi < 0) { gi = 0; dir = 1; }
      if (++guard > groups.length * 2) break;
    }
    groups[gi].push(p.id);
    gi += dir;
    if (gi >= groups.length) { gi = groups.length - 1; dir = -1; }
    else if (gi < 0) { gi = 0; dir = 1; }
  }
  return groups;
}
