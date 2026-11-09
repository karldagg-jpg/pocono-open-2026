// ── The course library: courses we've played ─────────────────────────────────
// One shared list that every weekend picks from. Each entry is still one set of
// tees with its own slope and rating — that's what scoring needs — but entries
// that share a `course` name are shown together as one course, so adding the
// White tees to a course you already have is two numbers, not thirty-eight.
//
// Older entries have only a `name` ("Buck Hill Golf Club White/blue (White
// tees)"). They keep working exactly as before and simply show as a course of
// their own until someone fills in the course and tee names.
import { getEffectiveHcp } from "./golfLogic.js";
import { playersAtRound } from "./handicapLock.js";

export const DEFAULT_PAR = [4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 3, 4, 5, 4];
export const DEFAULT_SI = [1, 5, 13, 3, 9, 17, 7, 11, 15, 2, 6, 14, 4, 10, 18, 8, 12, 16];

const sum = (a) => (a || []).reduce((t, v) => t + (Number(v) || 0), 0);
export const parTotal = (c) => sum(c?.par || DEFAULT_PAR);

/** The name shown for an entry: "Course · Tees" when it has both. */
export function displayName(entry) {
  const course = (entry?.course || "").trim();
  const tees = (entry?.tees || "").trim();
  if (course && tees) return `${course} · ${tees}`;
  return course || (entry?.name || "").trim() || "Unnamed course";
}

/** What an entry is grouped under. */
export function courseKey(entry) {
  return ((entry?.course || entry?.name || "Unnamed course").trim()).toLowerCase();
}

/** The library as a list, each entry carrying its id. */
export function libraryEntries(library) {
  return Object.entries(library || {}).map(([id, c]) => ({ id, ...c }));
}

/**
 * Entries grouped into courses, in the order given (callers sort first).
 * → [{ key, course, entries: [...] }]
 */
export function groupByCourse(entries) {
  const groups = new Map();
  for (const e of entries) {
    const key = courseKey(e);
    if (!groups.has(key)) groups.set(key, { key, course: (e.course || e.name || "Unnamed course").trim(), entries: [] });
    groups.get(key).entries.push(e);
  }
  return [...groups.values()];
}

/** Case-insensitive match on course, tees or the old-style name. */
export function searchEntries(entries, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => [e.course, e.tees, e.name].some((s) => (s || "").toLowerCase().includes(q)));
}

// ── Checking a course before it's saved ──────────────────────────────────────
// A duplicate stroke index used to save without a word and then hand out the
// wrong strokes all weekend. These are the mistakes that matter on a scorecard.

export function validateCourse(c) {
  const errors = [];
  const warnings = [];
  const name = (c?.course || c?.name || "").trim();
  if (!name) errors.push("Give the course a name.");

  const par = c?.par || [];
  const si = c?.si || [];
  if (par.length !== 18 || par.some((p) => !Number.isInteger(Number(p)) || Number(p) < 3 || Number(p) > 6)) {
    const bad = par.map((p, i) => (Number(p) >= 3 && Number(p) <= 6 ? null : i + 1)).filter(Boolean);
    errors.push(bad.length ? `Par must be 3 to 6 — check hole${bad.length > 1 ? "s" : ""} ${bad.join(", ")}.` : "Par needs all 18 holes.");
  }

  const nums = si.map(Number);
  const seen = new Map();
  nums.forEach((n, i) => { if (!seen.has(n)) seen.set(n, []); seen.get(n).push(i + 1); });
  const dupes = [...seen.entries()].filter(([n, holes]) => n >= 1 && n <= 18 && holes.length > 1);
  const outOfRange = nums.map((n, i) => (Number.isInteger(n) && n >= 1 && n <= 18 ? null : i + 1)).filter(Boolean);
  const missing = Array.from({ length: 18 }, (_, i) => i + 1).filter((n) => !seen.has(n));
  if (si.length !== 18 || outOfRange.length) {
    errors.push(outOfRange.length ? `Stroke index must be 1 to 18 — check hole${outOfRange.length > 1 ? "s" : ""} ${outOfRange.join(", ")}.` : "Stroke index needs all 18 holes.");
  }
  for (const [n, holes] of dupes) errors.push(`Stroke index ${n} is on holes ${holes.join(" and ")} — each number is used once.`);
  if (!dupes.length && !outOfRange.length && si.length === 18 && missing.length) {
    errors.push(`Stroke index ${missing.join(", ")} is missing.`);
  }

  const slope = Number(c?.slope);
  if (!Number.isFinite(slope) || slope < 55 || slope > 155) errors.push("Slope runs from 55 to 155 — it's on the scorecard next to the rating.");

  const rating = Number(c?.rating);
  const tp = sum(par);
  if (!Number.isFinite(rating) || rating <= 0) errors.push("Add the course rating.");
  else if (tp && Math.abs(rating - tp) > 10) warnings.push(`A rating of ${rating} on a par ${tp} is unusual — worth checking it's not the slope.`);

  if (tp && (tp < 60 || tp > 76)) warnings.push(`Par ${tp} is unusual for 18 holes.`);

  return { errors, warnings, ok: errors.length === 0 };
}

/**
 * Read a row typed or pasted from a scorecard.
 *   "4 4 3 5 4 3 4 5 4"   → nine numbers
 *   "4,4,3,5,…" (18)       → eighteen
 *   "443543454"            → digits run together work for par (one digit each)
 * → { values, error }
 */
export function parseHoleRow(text, { kind = "par" } = {}) {
  const raw = (text || "").trim();
  if (!raw) return { values: [], error: "Nothing to read." };
  let parts = raw.split(/[^0-9]+/).filter(Boolean);
  if (parts.length === 1 && kind === "par" && (parts[0].length === 9 || parts[0].length === 18)) parts = parts[0].split("");
  const values = parts.map(Number);
  if (values.length !== 9 && values.length !== 18) {
    return { values, error: `Found ${values.length} number${values.length === 1 ? "" : "s"} — a scorecard row has 9 or 18.` };
  }
  return { values, error: null };
}

/** A draft for a new set of tees on an existing course: same holes, new numbers. */
export function newTeesFrom(entry) {
  return {
    course: (entry?.course || entry?.name || "").trim(),
    tees: "",
    slope: "",
    rating: "",
    par: [...(entry?.par || DEFAULT_PAR)],
    si: [...(entry?.si || DEFAULT_SI)],
  };
}

/** What gets stored: the fields scoring reads, with `name` kept for older screens. */
export function cleanEntry(draft) {
  const course = (draft.course || draft.name || "").trim();
  const tees = (draft.tees || "").trim();
  return {
    name: tees ? `${course} · ${tees}` : course,
    course,
    tees,
    slope: Number(draft.slope),
    rating: Number(draft.rating),
    par: (draft.par || []).map(Number),
    si: (draft.si || []).map(Number),
  };
}

// ── Where we've played it ────────────────────────────────────────────────────

/**
 * When a weekend happened, as best the data can say: new weekends carry their
 * creation time in the id; older ones fall back to when their rounds were
 * locked. Used only to put recent courses first.
 */
export function weekendTime(id, event) {
  const m = /^w_([0-9a-z]+)$/.exec(id || "");
  if (m) { const t = parseInt(m[1], 36); if (Number.isFinite(t)) return t; }
  const locks = Object.values(event?.rounds || {}).map((r) => Number(r?.hcpLock?.at) || 0);
  return Math.max(0, ...locks);
}

const fullCard = (c) => (c || []).filter((n) => Number(n) > 0).length === 18;

/**
 * Every round played on a library course, across the weekends given.
 * weekends: [{ id, label, event }]  →  [{ weekendId, label, time, roundId, cards,
 *   avgGross, bestGross: {name, score}, lowNet: {name, score} }], newest first.
 * A tie names everyone on the number: "Steve & Jake".
 */
export function courseHistory(weekends, courseId) {
  const out = [];
  for (const w of weekends || []) {
    const ev = w.event || {};
    for (const [rid, r] of Object.entries(ev.rounds || {})) {
      if (r?.courseId == null || String(r.courseId) !== String(courseId)) continue;
      const course = ev.courses?.[r.courseId];
      const useIndex = ev.games?.useIndexHcp !== false;
      const cards = [];
      for (const p of playersAtRound(ev, rid)) {
        const card = r.scores?.[p.id];
        if (!fullCard(card)) continue;
        const gross = sum(card);
        const net = course || useIndex ? gross - getEffectiveHcp(p, course, useIndex) : null;
        cards.push({ name: p.name, gross, net });
      }
      if (!cards.length) continue;
      // Ties name everyone on the number — round 1 at Buck Hill had Steve and
      // Jake level on a net 72, and naming one of them would be wrong.
      const best = (k) => {
        const have = cards.filter((c) => c[k] != null);
        const score = Math.min(...have.map((c) => c[k]));
        return { name: have.filter((c) => c[k] === score).map((c) => c.name).join(" & "), score };
      };
      out.push({
        weekendId: w.id,
        label: w.label || w.id,
        time: weekendTime(w.id, ev),
        roundId: Number(rid),
        cards: cards.length,
        avgGross: Math.round((cards.reduce((t, c) => t + c.gross, 0) / cards.length) * 10) / 10,
        bestGross: best("gross"),
        lowNet: cards[0].net == null ? null : best("net"),
      });
    }
  }
  return out.sort((a, b) => b.time - a.time || a.roundId - b.roundId);
}

/**
 * Library entries, most useful first: anything on this weekend's rounds, then
 * the most recently played, then the rest by name.
 */
export function sortEntries(entries, { event = null, weekends = [] } = {}) {
  const onThisWeekend = new Set(Object.values(event?.rounds || {}).map((r) => String(r?.courseId)));
  const lastPlayed = new Map();
  for (const w of weekends) {
    const t = weekendTime(w.id, w.event);
    for (const r of Object.values(w.event?.rounds || {})) {
      const k = String(r?.courseId);
      const played = Object.values(r?.scores || {}).some(fullCard);
      if (played && t > (lastPlayed.get(k) || -1)) lastPlayed.set(k, t);
    }
  }
  return [...entries].sort((a, b) => {
    const ta = onThisWeekend.has(String(a.id)), tb = onThisWeekend.has(String(b.id));
    if (ta !== tb) return ta ? -1 : 1;
    const la = lastPlayed.get(String(a.id)) ?? -1, lb = lastPlayed.get(String(b.id)) ?? -1;
    if (la !== lb) return lb - la;
    return displayName(a).localeCompare(displayName(b));
  });
}

/**
 * Weekends that would lose a course if it were deleted: they use it on a round
 * and hold no copy of their own. Played weekends always hold a copy, so this is
 * only ever a weekend still being set up.
 */
export function weekendsRelyingOn(weekends, courseId) {
  const out = [];
  for (const w of weekends || []) {
    const ev = w.event || {};
    if (ev.courses?.[courseId]) continue;
    const rounds = Object.entries(ev.rounds || {})
      .filter(([, r]) => r?.courseId != null && String(r.courseId) === String(courseId))
      .map(([id]) => Number(id));
    if (rounds.length) out.push({ weekendId: w.id, label: w.label || w.id, rounds });
  }
  return out;
}

/** Hole indexes (0-based) to outline on the scorecard grid. */
export function holeProblems(c) {
  const par = new Set();
  const si = new Set();
  (c?.par || []).forEach((p, i) => { const n = Number(p); if (!(Number.isInteger(n) && n >= 3 && n <= 6)) par.add(i); });
  const at = new Map();
  (c?.si || []).forEach((v, i) => {
    const n = Number(v);
    if (!(Number.isInteger(n) && n >= 1 && n <= 18)) { si.add(i); return; }
    if (!at.has(n)) at.set(n, []);
    at.get(n).push(i);
  });
  for (const holes of at.values()) if (holes.length > 1) holes.forEach((i) => si.add(i));
  return { par, si };
}
