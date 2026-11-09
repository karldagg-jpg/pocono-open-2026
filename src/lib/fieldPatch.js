// ── Saving only what changed ─────────────────────────────────────────────────
// A save that writes a whole block (all the games, all the pairings) writes it
// as this phone last saw it — and anything another phone saved in between is
// lost. With four groups out at once that's closest-to-the-pin results
// vanishing, or a settings change on the Games screen wiping results recorded
// on the course since it was opened.
//
// Firestore can update one field deep inside the document by its dot-path
// ("games.ctp.results.2.6"). These build those patches, and `applyFields` makes
// the same change to this phone's copy so the screen and the server agree.

/** Apply dot-path fields to an object, without changing the original. */
export function applyFields(obj, fields) {
  let out = obj;
  for (const [path, value] of Object.entries(fields || {})) {
    const keys = path.split(".");
    const set = (node, i) => {
      const base = node && typeof node === "object" && !Array.isArray(node) ? node : {};
      const k = keys[i];
      if (i === keys.length - 1) {
        if (value === undefined) { const { [k]: _, ...rest } = base; return rest; }
        return { ...base, [k]: value };
      }
      return { ...base, [k]: set(base[k], i + 1) };
    };
    out = set(out, 0);
  }
  return out;
}

/** {a: 1, b: 2} under "sixies" → {"sixies.a": 1, "sixies.b": 2}. */
export function fieldsUnder(prefix, partial) {
  return Object.fromEntries(Object.entries(partial || {}).map(([k, v]) => [`${prefix}.${k}`, v]));
}

// ── Closest to the pin ───────────────────────────────────────────────────────

/** Record a closest-to-the-pin result for one hole. */
export function ctpResultFields(roundId, hole, { winnerId, distance = "", log = [] }) {
  const at = `${roundId}.${hole}`;
  return {
    [`games.ctp.results.${at}`]: winnerId,
    [`games.ctp.distances.${at}`]: distance,
    [`games.ctp.log.${at}`]: log,
  };
}

/** Clear one hole's result. Blank rather than deleted — every reader treats it as no winner. */
export function ctpClearFields(roundId, hole) {
  const at = `${roundId}.${hole}`;
  return { [`games.ctp.results.${at}`]: null, [`games.ctp.distances.${at}`]: null, [`games.ctp.log.${at}`]: null };
}

/**
 * The Games screen's save: its settings, field by field, plus only the
 * closest-to-the-pin winners changed on that screen. Results recorded on the
 * course are never rewritten by it.
 *   ctpEdits: { "round.hole": winnerId | null }
 */
export function gamesSettingsFields({ games, useIndexHcp, birdiePool, weekendBuyIn, optOuts, birdieOptOuts }, ctpEdits = {}) {
  const f = {
    weekendBuyIn,
    optOuts: [...(optOuts || [])],
    birdieOptOuts: [...(birdieOptOuts || [])],
    "games.useIndexHcp": useIndexHcp,
    "games.birdiePool": birdiePool,
  };
  for (const k of ["scatts", "lowNet", "hio"]) if (games?.[k]) f[`games.${k}`] = games[k];
  if (games?.ctp) {
    f["games.ctp.enabled"] = !!games.ctp.enabled;
    f["games.ctp.pot"] = Number(games.ctp.pot) || 0;
    f["games.ctp.holes"] = games.ctp.holes || {};
  }
  for (const [at, winnerId] of Object.entries(ctpEdits)) f[`games.ctp.results.${at}`] = winnerId ?? null;
  return f;
}
