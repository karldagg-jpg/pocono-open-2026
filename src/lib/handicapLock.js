// ── Locking handicaps to the round that was played ────────────────────────────
// Every net score in this app was being recomputed from whatever index a player
// carries TODAY. That makes history rewrite itself: Steve played the 2026
// weekend off 15 and is now an 11, so re-opening that weekend re-scores it four
// shots a round, moves the leaderboard, and changes who won scats and low net.
//
// A round therefore stores the indexes it was played off. Once locked, that
// round is settled and later changes to a player's index leave it alone.
//
// Nothing is locked implicitly. An unlocked round still reads live indexes,
// which is what you want while you're setting the weekend up and people are
// still being added.

/** The indexes a round was played off, or null if it was never locked. */
export function lockedIndexes(event, roundId) {
  const lock = event?.rounds?.[roundId]?.hcpLock;
  if (!lock || !lock.indexes || !Object.keys(lock.indexes).length) return null;
  return lock.indexes;
}

/** When a round was locked, and by how many players it's since drifted. */
export function lockStatus(event, roundId) {
  const lock = event?.rounds?.[roundId]?.hcpLock;
  if (!lock) return { locked: false, at: null, drifted: [] };
  const idx = lock.indexes || {};
  const drifted = (event.players || [])
    .filter((p) => idx[p.id] != null && Number(idx[p.id]) !== Number(p.hcpIndex))
    .map((p) => ({ player: p, playedOff: Number(idx[p.id]), nowIs: Number(p.hcpIndex) }));
  return { locked: true, at: lock.at || null, drifted, count: Object.keys(idx).length };
}

/**
 * The players as they stood for this round.
 *
 * Returns copies with hcpIndex taken from the lock, so every existing caller —
 * scats, low net, the live board — keeps working unchanged and simply sees the
 * right numbers. A player who joined after the lock keeps their live index
 * rather than being dropped: they have no locked value because they weren't
 * there, and scoring them off today's index is the only honest option.
 */
export function playersAtRound(event, roundId, players = null) {
  const list = players || event?.players || [];
  const idx = lockedIndexes(event, roundId);
  if (!idx) return list;
  return list.map((p) => (idx[p.id] == null ? p : { ...p, hcpIndex: Number(idx[p.id]) }));
}

/** Write the current indexes onto a round. Returns a new event. */
export function lockRound(event, roundId, { now = Date.now, players = null } = {}) {
  const list = players || event?.players || [];
  if (!event?.rounds?.[roundId]) return event;
  const indexes = {};
  for (const p of list) indexes[p.id] = Number(p.hcpIndex) || 0;
  return {
    ...event,
    rounds: {
      ...event.rounds,
      [roundId]: { ...event.rounds[roundId], hcpLock: { at: now(), indexes } },
    },
  };
}

/** Drop a round's lock so it follows live indexes again. */
export function unlockRound(event, roundId) {
  const round = event?.rounds?.[roundId];
  if (!round?.hcpLock) return event;
  const { hcpLock, ...rest } = round;
  return { ...event, rounds: { ...event.rounds, [roundId]: rest } };
}

/** Correct one player's locked index — for a value entered wrong at the time. */
export function setLockedIndex(event, roundId, playerId, index) {
  const round = event?.rounds?.[roundId];
  if (!round?.hcpLock) return event;
  const v = Number(index);
  if (!Number.isFinite(v)) return event;
  return {
    ...event,
    rounds: {
      ...event.rounds,
      [roundId]: {
        ...round,
        hcpLock: { ...round.hcpLock, indexes: { ...round.hcpLock.indexes, [playerId]: v } },
      },
    },
  };
}

/** Lock every round that has a score on it — the "settle the weekend" action. */
export function lockPlayedRounds(event, opts = {}) {
  let next = event;
  for (const id of Object.keys(event?.rounds || {})) {
    const scores = event.rounds[id]?.scores || {};
    const anyPlayed = Object.values(scores).some((arr) => (arr || []).some(Boolean));
    if (anyPlayed && !event.rounds[id].hcpLock) next = lockRound(next, id, opts);
  }
  return next;
}
