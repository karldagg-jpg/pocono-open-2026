import { useState, useEffect, useMemo } from "react";
import { CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { saveLibrary, saveLibraryCourse, deleteLibraryCourse, fetchWeekends } from "../firebase/client";
import { roundIds } from "../lib/rounds";
import { roundCourseState, snapshotCourse, roundStarted } from "../lib/courses";
import {
  DEFAULT_PAR, DEFAULT_SI, parTotal, displayName, libraryEntries, groupByCourse, searchEntries,
  validateCourse, parseHoleRow, newTeesFrom, cleanEntry, courseHistory, sortEntries, weekendsRelyingOn, holeProblems,
} from "../lib/courseLibrary";

const newCourseId = () => `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const numbers = (c) => `Par ${parTotal(c)} · ${c.rating || "–"} / ${c.slope || "–"}`;

// The Courses screen does two jobs: pick a course for each round of this
// weekend, and look after the library of every course we've played.
//
// `library` is the shared catalog (live from App). Once a round has started the
// weekend plays its own copy of the course, so edits here only reach rounds
// that haven't teed off — each round card says which it is.
export default function CourseScreen({ event, saveEvent, library = {}, weekendIndex = {}, weekendId = null }) {
  const rounds = event.rounds || {};
  const ids = roundIds(event);

  const [openRound, setOpenRound] = useState(null);   // round whose picker is open
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);       // { id | "__new__", draft, assignTo }
  const [others, setOthers] = useState([]);           // other weekends, for history

  // One-time migration: an old weekend with courses embedded and an empty
  // library seeds the library from them.
  useEffect(() => {
    const legacy = event.courses || {};
    if (Object.keys(library).length === 0 && Object.keys(legacy).length > 0) {
      const seeded = {};
      for (const [id, c] of Object.entries(legacy)) if (c?.name || c?.par) seeded[id] = c;
      if (Object.keys(seeded).length) saveLibrary(seeded);
    }
  }, [library, event.courses]);

  // Every other weekend, read once, so each course can say where we played it.
  const otherKey = Object.keys(weekendIndex).filter((id) => id !== weekendId).join();
  useEffect(() => {
    const otherIds = otherKey ? otherKey.split(",") : [];
    if (!otherIds.length) return;
    let live = true;
    fetchWeekends(otherIds).then((ws) => { if (live) setOthers(ws); });
    return () => { live = false; };
  }, [otherKey]);

  const weekends = useMemo(() => {
    const label = (id) => weekendIndex[id]?.label || id;
    const here = weekendId ? [{ id: weekendId, label: label(weekendId), event }] : [];
    return [...here, ...others.map((w) => ({ ...w, label: label(w.id) }))];
  }, [event, others, weekendId, weekendIndex]);

  const entries = useMemo(
    () => sortEntries(libraryEntries(library), { event, weekends }),
    [library, event, weekends],
  );

  // ── Assigning ─────────────────────────────────────────────────────────────
  // Only the one round's courseId is written, never the whole set of rounds —
  // writing every round back is how another group's scores get overwritten.
  function assign(r, courseId) {
    const cur = rounds[r]?.courseId ?? null;
    if (String(cur) === String(courseId)) { setOpenRound(null); return; }
    if (roundStarted(event, r) && !window.confirm(
      `Round ${r} already has scores. Changing its course re-scores everything entered so far. Change it?`,
    )) return;
    const next = { ...event, rounds: { ...rounds, [r]: { ...(rounds[r] || {}), courseId: courseId ?? null } } };
    saveEvent(next, { [`rounds.${r}.courseId`]: courseId ?? null });
    setOpenRound(null);
    setQuery("");
  }

  // Bring a weekend's copy up to date with the library, deliberately.
  function adoptLibraryVersion(courseId, startedRounds) {
    const msg = startedRounds.length
      ? `Use the library's version for this weekend? Round ${startedRounds.join(", ")} already has scores, and the new par, stroke index, slope or rating will re-score it.`
      : "Use the library's version for this weekend?";
    if (!window.confirm(msg)) return;
    const copy = snapshotCourse(library[courseId]);
    saveEvent({ ...event, courses: { ...(event.courses || {}), [courseId]: copy } }, { [`courses.${courseId}`]: copy });
  }

  // ── Library edits ─────────────────────────────────────────────────────────
  function startNew(assignTo = null) {
    setEditing({ id: "__new__", draft: { course: "", tees: "", slope: "", rating: "", par: [...DEFAULT_PAR], si: [...DEFAULT_SI] }, assignTo });
  }
  function startTees(entry) {
    setEditing({ id: "__new__", draft: newTeesFrom(entry), assignTo: null });
  }
  function startEdit(entry) {
    const { id, ...c } = entry;
    setEditing({
      id,
      draft: { ...c, course: c.course || c.name || "", tees: c.tees || "", par: [...(c.par || DEFAULT_PAR)], si: [...(c.si || DEFAULT_SI)] },
      assignTo: null,
    });
  }
  async function saveEditing() {
    const id = editing.id === "__new__" ? newCourseId() : editing.id;
    const clean = cleanEntry(editing.draft);
    const assignTo = editing.assignTo;
    setEditing(null);
    await saveLibraryCourse(id, clean);
    if (assignTo != null) assign(assignTo, id);
  }
  async function remove(entry) {
    const here = Object.entries(rounds).filter(([, r]) => String(r?.courseId) === String(entry.id)).map(([r]) => Number(r));
    const relying = weekendsRelyingOn(weekends, entry.id).filter((w) => w.weekendId !== weekendId);
    const lines = [`Delete ${displayName(entry)} from the library?`];
    if (here.length && !event.courses?.[entry.id]) lines.push(`Round ${here.join(", ")} of this weekend will need a new course.`);
    for (const w of relying) lines.push(`${w.label} uses it on round ${w.rounds.join(", ")} and will need a new course.`);
    if (!window.confirm(lines.join("\n\n"))) return;
    await deleteLibraryCourse(entry.id);
    if (here.length && !event.courses?.[entry.id]) {
      const patch = {};
      const nextRounds = { ...rounds };
      for (const r of here) { patch[`rounds.${r}.courseId`] = null; nextRounds[r] = { ...nextRounds[r], courseId: null }; }
      saveEvent({ ...event, rounds: nextRounds }, patch);
    }
  }

  if (editing) {
    const usedHere = editing.id === "__new__" ? [] : ids.filter((r) => String(rounds[r]?.courseId) === String(editing.id));
    return (
      <Shell>
        <CourseEditor
          editing={editing}
          setDraft={(d) => setEditing((e) => ({ ...e, draft: typeof d === "function" ? d(e.draft) : d }))}
          inUse={usedHere}
          started={usedHere.filter(() => !!event.courses?.[editing.id])}
          onCancel={() => setEditing(null)}
          onSave={saveEditing}
        />
      </Shell>
    );
  }

  const filtered = searchEntries(entries, query);
  const groups = groupByCourse(entries);

  return (
    <Shell>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>Courses</div>
      <div style={{ color: M, fontSize: "14px", marginBottom: "18px", lineHeight: 1.45 }}>
        Pick a course for each round. The library keeps every course you've played.
      </div>

      {/* ── Rounds ─────────────────────────────────────────────────────── */}
      <Label>This weekend</Label>
      <div style={{ display: "grid", gap: "10px", margin: "8px 0 26px" }}>
        {ids.map((r) => {
          const st = roundCourseState(event, library, r);
          const open = openRound === r;
          const sameCourseStarted = ids.filter((x) => String(rounds[x]?.courseId) === String(st.courseId) && roundStarted(event, x));
          return (
            <div key={r} style={{ background: CARD, border: `1px solid ${open ? G : "#d8ddd8"}`, borderRadius: "12px", overflow: "hidden" }}>
              <button
                onClick={() => { setOpenRound(open ? null : r); setQuery(""); }}
                aria-expanded={open}
                style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "13px 14px", cursor: "pointer", fontFamily: FB, display: "flex", gap: "12px", alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: M, letterSpacing: ".06em", textTransform: "uppercase" }}>Round {r}</div>
                  <div style={{ fontSize: "16px", fontWeight: 600, color: st.course ? CREAM : M, marginTop: "2px" }}>
                    {st.course ? displayName(st.course) : "Choose a course"}
                  </div>
                  {st.course && <div style={{ fontSize: "13px", color: M, marginTop: "2px", fontVariantNumeric: "tabular-nums" }}>{numbers(st.course)}</div>}
                </div>
                <StatePill state={st} />
              </button>

              {st.outdated && (
                <div style={{ padding: "0 14px 12px", fontSize: "13px", color: M, lineHeight: 1.45 }}>
                  The library's version has changed since this weekend started.{" "}
                  <button onClick={() => adoptLibraryVersion(st.courseId, sameCourseStarted)} style={linkBtn}>Use the new version</button>
                </div>
              )}

              {open && (
                <div style={{ borderTop: "1px solid #e3e7e3", padding: "12px 14px 14px", background: CARD2 }}>
                  {entries.length > 5 && (
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search courses"
                      aria-label="Search courses" style={{ ...inputStyle, marginBottom: "10px" }} />
                  )}
                  <div style={{ display: "grid", gap: "6px" }}>
                    {groupByCourse(filtered).map((g) => (
                      <div key={g.key} style={{ display: "grid", gap: "6px" }}>
                        {g.entries.length > 1 && <div style={{ fontSize: "12px", fontWeight: 700, color: M, marginTop: "4px" }}>{g.course}</div>}
                        {g.entries.map((e) => {
                          const chosen = String(e.id) === String(st.courseId);
                          return (
                            <button key={e.id} onClick={() => assign(r, e.id)}
                              style={{ ...pickRow, borderColor: chosen ? G : "#d8ddd8", background: chosen ? "#e8f4ed" : "#fff" }}>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: "block", fontSize: "14px", fontWeight: 600, color: CREAM }}>
                                  {g.entries.length > 1 ? (e.tees || displayName(e)) : displayName(e)}
                                </span>
                                <span style={{ display: "block", fontSize: "12px", color: M, fontVariantNumeric: "tabular-nums" }}>{numbers(e)}</span>
                              </span>
                              {chosen && <span style={{ fontSize: "12px", fontWeight: 700, color: G }}>Chosen</span>}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                    {!filtered.length && <div style={{ fontSize: "13px", color: M, padding: "6px 0" }}>No course matches “{query}”.</div>}
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                    <button onClick={() => startNew(r)} style={primaryBtn}>+ New course</button>
                    {st.courseId != null && <button onClick={() => assign(r, null)} style={ghostBtn}>Clear round {r}</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Library ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <Label>Course library · {groups.length}</Label>
        <button onClick={() => startNew()} style={ghostBtn}>+ Add course</button>
      </div>
      {!groups.length && <div style={{ color: M, fontSize: "14px", padding: "10px 0" }}>No courses yet. Add the first one and it'll be here for every weekend after.</div>}
      <div style={{ display: "grid", gap: "10px" }}>
        {groups.map((g) => {
          const history = g.entries.flatMap((e) => courseHistory(weekends, e.id));
          history.sort((a, b) => b.time - a.time || a.roundId - b.roundId);
          return (
            <div key={g.key} style={{ background: CARD, border: "1px solid #d8ddd8", borderRadius: "12px", padding: "13px 14px" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: CREAM }}>{g.course}</div>
              {history.length > 0 ? (
                <div style={{ marginTop: "6px", display: "grid", gap: "3px" }}>
                  {history.slice(0, 4).map((h) => (
                    <div key={`${h.weekendId}-${h.roundId}`} style={{ fontSize: "12px", color: M, lineHeight: 1.45 }}>
                      <span style={{ color: CREAM, fontWeight: 600 }}>{h.label}, round {h.roundId}</span>
                      {" · "}{h.cards} played · avg {h.avgGross} · best {h.bestGross.name} {h.bestGross.score}
                      {h.lowNet && <> · low net {h.lowNet.name} {h.lowNet.score}</>}
                    </div>
                  ))}
                  {history.length > 4 && <div style={{ fontSize: "12px", color: M }}>and {history.length - 4} more round{history.length - 4 === 1 ? "" : "s"}</div>}
                </div>
              ) : (
                <div style={{ fontSize: "12px", color: M, marginTop: "4px" }}>Not played yet</div>
              )}

              <div style={{ marginTop: "10px", display: "grid", gap: "6px" }}>
                {g.entries.map((e) => {
                  const usedOn = ids.filter((r) => String(rounds[r]?.courseId) === String(e.id));
                  return (
                    <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", background: CARD2, borderRadius: "9px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Older entries have the tees in the course name, so
                            the numbers lead instead of a blank tee label. */}
                        {e.tees && <div style={{ fontSize: "14px", fontWeight: 600, color: CREAM }}>{e.tees}</div>}
                        <div style={{ fontSize: e.tees ? "12px" : "14px", color: e.tees ? M : CREAM, fontWeight: e.tees ? 400 : 600, fontVariantNumeric: "tabular-nums" }}>
                          {numbers(e)}{usedOn.length > 0 && <span style={{ color: G, fontWeight: 600 }}> · Round {usedOn.join(", ")}</span>}
                        </div>
                      </div>
                      <button onClick={() => startEdit(e)} style={smallBtn}>Edit</button>
                      <button onClick={() => remove(e)} style={{ ...smallBtn, color: R }} aria-label={`Delete ${displayName(e)}`}>Delete</button>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => startTees(g.entries[0])} style={{ ...linkBtn, marginTop: "10px" }}>+ Add another set of tees</button>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return <div style={{ maxWidth: "640px", margin: "0 auto", padding: "22px 16px 40px" }}>{children}</div>;
}

function StatePill({ state }) {
  const s = !state.course
    ? { text: "Not set", fg: R, bg: "rgba(176,32,32,.08)" }
    : state.source === "own"
    ? { text: state.locked ? "Locked" : "In play", fg: G, bg: "#e8f4ed" }
    : { text: "Ready", fg: GO, bg: "rgba(138,106,0,.08)" };
  return (
    <span style={{ fontSize: "12px", fontWeight: 700, color: s.fg, background: s.bg, padding: "4px 9px", borderRadius: "999px", whiteSpace: "nowrap" }}>
      {s.text}
    </span>
  );
}

// ── Adding or editing a course ───────────────────────────────────────────────
export function CourseEditor({ editing, setDraft, inUse, started, onCancel, onSave }) {
  const d = editing.draft;
  const isNew = editing.id === "__new__";
  const v = validateCourse(d);
  const set = (k, val) => setDraft((x) => ({ ...x, [k]: val }));
  const setHole = (kind, i, val) => setDraft((x) => {
    const arr = [...(x[kind] || [])];
    arr[i] = val === "" ? "" : parseInt(val, 10) || 0;
    return { ...x, [kind]: arr };
  });

  return (
    <div>
      <div style={{ fontFamily: FD, fontSize: "26px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        {isNew ? (d.course ? `New tees · ${d.course}` : "New course") : "Edit course"}
      </div>
      {!isNew && started.length > 0 && (
        <div style={{ fontSize: "13px", color: M, marginBottom: "14px", lineHeight: 1.45 }}>
          Round {started.join(", ")} of this weekend has started and keeps the version it started with. Changes here apply from the next weekend.
        </div>
      )}
      {!isNew && !started.length && inUse.length > 0 && (
        <div style={{ fontSize: "13px", color: M, marginBottom: "14px" }}>Used on round {inUse.join(", ")} of this weekend.</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", margin: "14px 0 18px" }}>
        <Field label="Course" span>
          <input value={d.course || ""} onChange={(e) => set("course", e.target.value)} placeholder="Pinehurst No. 2" style={inputStyle} />
        </Field>
        <Field label="Tees" span>
          <input value={d.tees || ""} onChange={(e) => set("tees", e.target.value)} placeholder="Blue" style={inputStyle} />
        </Field>
        <Field label="Rating">
          <input value={d.rating ?? ""} onChange={(e) => set("rating", e.target.value)} inputMode="decimal" placeholder="75.1" style={inputStyle} />
        </Field>
        <Field label="Slope">
          <input value={d.slope ?? ""} onChange={(e) => set("slope", e.target.value)} inputMode="numeric" placeholder="138" style={inputStyle} />
        </Field>
      </div>

      {[{ label: "Front nine", start: 0 }, { label: "Back nine", start: 9 }].map(({ label, start }) => (
        <Nine key={label} label={label} start={start} draft={d} setHole={setHole} setDraft={setDraft} />
      ))}

      <div style={{ fontSize: "13px", color: M, margin: "4px 0 12px" }}>Par {parTotal(d)}</div>

      {(v.errors.length > 0 || v.warnings.length > 0) && (
        <div style={{ display: "grid", gap: "6px", marginBottom: "14px" }} role="status">
          {v.errors.map((e) => <div key={e} style={{ ...note, color: R, background: "rgba(176,32,32,.06)" }}>{e}</div>)}
          {v.warnings.map((w) => <div key={w} style={{ ...note, color: GO, background: "rgba(138,106,0,.07)" }}>{w}</div>)}
        </div>
      )}

      <div style={{ display: "flex", gap: "9px" }}>
        <button onClick={onCancel} style={ghostBtn}>Cancel</button>
        <button onClick={onSave} disabled={!v.ok}
          style={{ ...primaryBtn, flex: 1, background: v.ok ? G : "#c8d0c8", cursor: v.ok ? "pointer" : "not-allowed" }}>
          {isNew ? (editing.assignTo != null ? `Add and use for round ${editing.assignTo}` : "Add to library") : "Save"}
        </button>
      </div>
    </div>
  );
}

// One nine: a box to type or paste the scorecard row, then the holes to check.
function Nine({ label, start, draft, setHole, setDraft }) {
  const [paste, setPaste] = useState({ par: "", si: "" });
  const [err, setErr] = useState({ par: null, si: null });
  const nine = (kind) => (draft[kind] || []).slice(start, start + 9);
  const bad = holeProblems(draft);

  function apply(kind, text) {
    setPaste((p) => ({ ...p, [kind]: text }));
    if (!text.trim()) { setErr((e) => ({ ...e, [kind]: null })); return; }
    const { values, error } = parseHoleRow(text, { kind });
    if (error) { setErr((e) => ({ ...e, [kind]: error })); return; }
    setErr((e) => ({ ...e, [kind]: null }));
    setDraft((x) => {
      const arr = [...(x[kind] || Array(18).fill(""))];
      // Eighteen fills the whole card; nine fills this nine.
      if (values.length === 18) values.forEach((n, i) => { arr[i] = n; });
      else values.forEach((n, i) => { arr[start + i] = n; });
      return { ...x, [kind]: arr };
    });
  }

  const grid = { display: "grid", gridTemplateColumns: "34px repeat(9, minmax(0, 1fr))", gap: "4px", alignItems: "center" };
  return (
    <div style={{ marginBottom: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <Label>{label}</Label>
        <span style={{ fontSize: "12px", color: M, fontWeight: 600 }}>Par {nine("par").reduce((a, b) => a + (Number(b) || 0), 0)}</span>
      </div>
      <div style={{ display: "grid", gap: "6px", marginBottom: "8px" }}>
        {["par", "si"].map((kind) => (
          <div key={kind}>
            <input value={paste[kind]} onChange={(e) => apply(kind, e.target.value)}
              placeholder={kind === "par" ? "Type or paste the par row: 4 4 3 5 …" : "Type or paste the stroke index row: 7 15 3 …"}
              aria-label={`${label} ${kind === "par" ? "par" : "stroke index"} row`}
              style={{ ...inputStyle, fontSize: "13px", padding: "8px 10px" }} />
            {err[kind] && <div style={{ fontSize: "12px", color: R, marginTop: "3px" }}>{err[kind]}</div>}
          </div>
        ))}
      </div>
      <div style={grid}>
        <div />
        {Array.from({ length: 9 }, (_, i) => <div key={i} style={{ textAlign: "center", fontSize: "11px", color: M, fontWeight: 600 }}>{start + i + 1}</div>)}
      </div>
      {["par", "si"].map((kind) => (
        <div key={kind} style={{ ...grid, marginTop: "4px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD }}>{kind === "par" ? "Par" : "SI"}</div>
          {nine(kind).map((n, i) => (
            <input key={i} value={n ?? ""} onChange={(e) => setHole(kind, start + i, e.target.value)} inputMode="numeric"
              aria-label={`Hole ${start + i + 1} ${kind === "par" ? "par" : "stroke index"}`}
              aria-invalid={bad[kind].has(start + i) || undefined}
              style={bad[kind].has(start + i) ? { ...holeInput, borderColor: R, background: "rgba(176,32,32,.07)", color: R, fontWeight: 700 } : holeInput} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Field({ label, span, children }) {
  return <label style={{ display: "block", gridColumn: span ? "1 / -1" : undefined }}><Label>{label}</Label><div style={{ marginTop: "5px" }}>{children}</div></label>;
}

function Label({ children }) {
  return <div style={{ fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>{children}</div>;
}

const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: "9px", border: "1px solid #c8d0c8",
  background: "#fff", color: CREAM, fontSize: "15px", fontFamily: FB, outline: "none", boxSizing: "border-box",
};
const holeInput = {
  width: "100%", padding: "8px 0", textAlign: "center", borderRadius: "7px", border: "1px solid #c8d0c8",
  background: "#fff", color: CREAM, fontSize: "15px", fontFamily: FB, outline: "none", boxSizing: "border-box",
  fontVariantNumeric: "tabular-nums",
};
const pickRow = {
  width: "100%", display: "flex", alignItems: "center", gap: "10px", textAlign: "left", padding: "10px 12px",
  border: "1px solid #d8ddd8", borderRadius: "9px", cursor: "pointer", fontFamily: FB, minHeight: "48px",
};
const primaryBtn = {
  padding: "11px 16px", borderRadius: "9px", border: "none", background: G, color: "#fff",
  fontFamily: FB, fontSize: "14px", fontWeight: 700, cursor: "pointer",
};
const ghostBtn = {
  padding: "10px 14px", borderRadius: "9px", border: "1px solid #c8d0c8", background: "transparent",
  color: CREAM, fontFamily: FB, fontSize: "13px", fontWeight: 600, cursor: "pointer",
};
const smallBtn = {
  padding: "8px 11px", borderRadius: "8px", border: "1px solid #c8d0c8", background: "#fff",
  color: CREAM, fontFamily: FB, fontSize: "13px", fontWeight: 600, cursor: "pointer", minHeight: "36px",
};
const linkBtn = {
  border: "none", background: "transparent", padding: 0, color: G, fontFamily: FB, fontSize: "13px",
  fontWeight: 700, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px",
};
const note = { fontSize: "13px", padding: "8px 10px", borderRadius: "8px", lineHeight: 1.4 };
