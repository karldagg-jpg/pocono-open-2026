// ── Casual games ──────────────────────────────────────────────────────────────
// A sixies game you set up on the spot — no weekend, no tournament, just who
// turned up and which course. Stored as a map of games in a single document so
// it inherits the same security rules as everything else under `weekends`.
//
// Deliberately the same inner shape as `event.sixies`, so the Sixies screen can
// render either without caring which it was handed.

export const newGameId = (now = Date.now) => `g_${now().toString(36)}`;
export const newPlayerId = (now = Date.now) => now();

/** An empty game, ready to have players and a course added. */
export function createCasualGame({ label, courseId = null, players = [], date, id, now = Date.now } = {}) {
  const when = date || new Date(now()).toISOString().slice(0, 10);
  return {
    id: id || newGameId(now),
    label: (label || "").trim() || `Round ${when}`,
    date: when,
    courseId,
    players: players.map(p => ({ ...p })),
    playerIds: players.map(p => p.id),
    scores: {},
    takes: {},
    junk: {},
    stakes: { unit: "game", amount: "", note: "" },
  };
}

/** Add a player. Names are matched case-insensitively so nobody is entered twice. */
export function addCasualPlayer(game, { name, hcpIndex = 0, id, now = Date.now } = {}) {
  const clean = (name || "").trim();
  if (!clean) return game;
  const exists = (game.players || []).some(p => p.name.trim().toLowerCase() === clean.toLowerCase());
  if (exists) return game;
  const player = { id: id ?? newPlayerId(now), name: clean, hcpIndex: Number(hcpIndex) || 0 };
  const players = [...(game.players || []), player];
  return { ...game, players, playerIds: players.map(p => p.id) };
}

/** Remove a player and any scores they had, so nothing is left dangling. */
export function removeCasualPlayer(game, playerId) {
  const players = (game.players || []).filter(p => p.id !== playerId);
  const drop = (obj) => {
    const out = { ...(obj || {}) };
    delete out[playerId];
    return out;
  };
  return {
    ...game,
    players,
    playerIds: players.map(p => p.id),
    scores: drop(game.scores),
    takes: drop(game.takes),
    junk: drop(game.junk),
  };
}

/** Most recent first — what you want when picking up a game you just played. */
export function listCasualGames(all) {
  return Object.values(all || {}).sort((a, b) => {
    const d = String(b.date || "").localeCompare(String(a.date || ""));
    return d !== 0 ? d : String(b.id).localeCompare(String(a.id));
  });
}

export function upsertCasualGame(all, game) {
  return { ...(all || {}), [game.id]: game };
}

export function deleteCasualGame(all, gameId) {
  const out = { ...(all || {}) };
  delete out[gameId];
  return out;
}

/** What's still missing before the game can be scored. */
export function gameReadiness(game, courses = {}) {
  const problems = [];
  if (!game) return { ready: false, problems: ["No game selected"] };
  if (!game.courseId || !courses[game.courseId]) problems.push("Pick a course");
  const n = (game.players || []).length;
  if (n < 2) problems.push(`Add at least 2 players (${n} so far)`);
  return { ready: problems.length === 0, problems };
}
