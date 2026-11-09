// ── Which version of a course a weekend plays ────────────────────────────────
// Every screen used to read course details from the shared library first, so
// fixing one stroke index on Buck Hill today would quietly re-score 2026: its
// strokes, its scats and its money. Same problem as handicaps drifting, same
// fix — once a round is under way the weekend keeps its own copy of the course,
// and library edits only reach weekends that haven't teed off.
//
// The rule is one line: the weekend's own copy wins; the library fills in the
// rest. Everything else here decides when to take that copy and how to explain
// it on screen.

const FIELDS = ["name", "slope", "rating", "par", "si", "course", "tees"];

/** Every course this weekend can see, its own copies taking precedence. */
export function coursesFor(event, library = {}) {
  return { ...(library || {}), ...(event?.courses || {}) };
}

/** The course a round is played on, or null. */
export function roundCourse(event, library, roundId) {
  const cid = event?.rounds?.[roundId]?.courseId;
  if (cid == null || cid === "") return null;
  return coursesFor(event, library)[cid] || null;
}

/** A clean copy of a library course — only the fields scoring needs. */
export function snapshotCourse(course) {
  if (!course) return null;
  const out = {};
  for (const k of FIELDS) if (course[k] !== undefined) out[k] = JSON.parse(JSON.stringify(course[k]));
  return out;
}

const hasCard = (c) => (c || []).some((n) => Number(n) > 0);

/** Has anyone put a score on this round yet? */
export function roundStarted(event, roundId) {
  return Object.values(event?.rounds?.[roundId]?.scores || {}).some(hasCard);
}

/** True when the weekend already holds its own copy of this course. */
export function hasOwnCopy(event, courseId) {
  return courseId != null && !!event?.courses?.[courseId];
}

/**
 * Fields to write so the weekend keeps its own copy of a round's course —
 * empty when there's nothing to do (no course, already copied, or the course
 * isn't in the library). Written alongside the first score of the round, as
 * dot-paths, so it can't overwrite anything else.
 */
export function freezeFields(event, library, roundId) {
  const cid = event?.rounds?.[roundId]?.courseId;
  if (cid == null || cid === "" || hasOwnCopy(event, cid)) return {};
  const lib = library?.[cid];
  if (!lib) return {};
  return { [`courses.${cid}`]: snapshotCourse(lib) };
}

/** Same as freezeFields but applied to an event object, for local state. */
export function withFrozenCourse(event, library, roundId) {
  const f = freezeFields(event, library, roundId);
  const key = Object.keys(f)[0];
  if (!key) return event;
  const cid = key.slice("courses.".length);
  return { ...event, courses: { ...(event.courses || {}), [cid]: f[key] } };
}

/** Does the library's version differ from the copy this weekend is playing? */
export function libraryDiffers(event, library, courseId) {
  const own = event?.courses?.[courseId];
  const lib = library?.[courseId];
  if (!own || !lib) return false;
  return ["slope", "rating", "par", "si"].some((k) => JSON.stringify(own[k]) !== JSON.stringify(lib[k]));
}

/** Round numbers in this weekend that use a course. */
export function roundsUsing(event, courseId) {
  return Object.entries(event?.rounds || {})
    .filter(([, r]) => r?.courseId != null && String(r.courseId) === String(courseId))
    .map(([id]) => Number(id))
    .sort((a, b) => a - b);
}

/**
 * Everything the Courses screen needs to say about one round.
 *   source  — "own" (the weekend's copy), "library", or "missing"
 *   started — someone has a score on it
 *   locked  — handicaps pinned
 *   outdated — the library has changed since the weekend took its copy
 */
export function roundCourseState(event, library, roundId) {
  const r = event?.rounds?.[roundId] || {};
  const cid = r.courseId;
  const course = roundCourse(event, library, roundId);
  const source = !course ? "missing" : hasOwnCopy(event, cid) ? "own" : "library";
  return {
    roundId: Number(roundId),
    courseId: cid ?? null,
    course,
    source,
    started: roundStarted(event, roundId),
    locked: !!r.hcpLock,
    outdated: source === "own" && libraryDiffers(event, library, cid),
  };
}
