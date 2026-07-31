import { useState, useEffect } from "react";
import { CARD2, CREAM, G, GOLD, M, R, FD, FB } from "../constants/theme";
import { saveLibrary } from "../firebase/client";

const DEFAULT_PAR = [4,4,3,5,4,3,4,5,4, 4,4,3,5,4,3,4,5,4];
const DEFAULT_SI  = [1,5,13,3,9,17,7,11,15, 2,6,14,4,10,18,8,12,16];
const ROUNDS = [1, 2, 3];

const newCourseId = () => `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const parTotal = (c) => (c.par || DEFAULT_PAR).reduce((a, b) => a + b, 0);

// `library` is the shared course catalog (owned by App, live via subscribeLibrary) —
// the single source of truth for course data across every screen. This screen only
// edits it and assigns a courseId to each round; it no longer snapshots course
// content into the event doc.
export default function CourseScreen({ event, saveEvent, library }) {
  const [editingId, setEditingId] = useState(null); // course id being edited, or "__new__"
  const [draft, setDraft] = useState(null);

  const rounds = event.rounds || {};

  // One-time migration: if the library is empty but this event already has
  // courses embedded (the old, pre-library model), seed the library from them.
  useEffect(() => {
    const legacyCourses = event.courses || {};
    if (Object.keys(library).length === 0 && Object.keys(legacyCourses).length > 0) {
      const seeded = {};
      for (const [id, c] of Object.entries(legacyCourses)) if (c?.name || c?.par) seeded[id] = c;
      if (Object.keys(seeded).length) saveLibrary(seeded);
    }
  }, [library, event.courses]);

  const libList = Object.entries(library).map(([id, c]) => ({ id, ...c }));

  // ── Library CRUD ──────────────────────────────────────────────────────────
  function startNew() {
    setEditingId("__new__");
    setDraft({ name: "", slope: 113, rating: 72.0, par: [...DEFAULT_PAR], si: [...DEFAULT_SI] });
  }
  function startEdit(id) {
    setEditingId(id);
    setDraft({ name: "", slope: 113, rating: 72.0, par: [...DEFAULT_PAR], si: [...DEFAULT_SI], ...library[id] });
  }
  function cancelEdit() { setEditingId(null); setDraft(null); }

  function saveCourse() {
    const c = draft;
    const tp = parTotal(c);
    const clean = { name: c.name || "Unnamed course", slope: Number(c.slope) || 113, rating: Number(c.rating) || tp, par: c.par || [...DEFAULT_PAR], si: c.si || [...DEFAULT_SI] };
    const id = editingId === "__new__" ? newCourseId() : editingId;
    saveLibrary({ ...library, [id]: clean });
    cancelEdit();
  }

  function deleteCourse(id) {
    const usedRounds = ROUNDS.filter((r) => rounds[r]?.courseId === id);
    const msg = usedRounds.length
      ? `Delete "${library[id]?.name}"? It's assigned to round ${usedRounds.join(", ")} — those rounds will become unassigned.`
      : `Delete "${library[id]?.name}" from the library?`;
    if (!window.confirm(msg)) return;
    const nextLib = { ...library }; delete nextLib[id];
    saveLibrary(nextLib);
    if (usedRounds.length) {
      const nextRounds = { ...rounds };
      usedRounds.forEach((r) => { nextRounds[r] = { ...(nextRounds[r] || {}), courseId: null }; });
      saveEvent({ ...event, rounds: nextRounds }, { rounds: nextRounds });
    }
  }

  // ── Assign a library course to a round (just a reference — the library is the
  //    single source of truth for its content) ─────────────────────────────────
  function assignRound(r, courseId) {
    const nextRounds = { ...rounds, [r]: { ...(rounds[r] || {}), courseId: courseId || null } };
    const patch = { rounds: nextRounds };
    saveEvent({ ...event, ...patch }, patch);
  }

  const setField = (key, val) => setDraft((d) => ({ ...d, [key]: val }));
  const setHole = (which, i, val) => setDraft((d) => {
    const arr = [...(d[which] || (which === "par" ? DEFAULT_PAR : DEFAULT_SI))];
    arr[i] = parseInt(val) || 0;
    return { ...d, [which]: arr };
  });

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>Courses</div>
      <div style={{ color: M, fontSize: "14px", marginBottom: "18px" }}>
        A shared library of courses, reusable across every weekend · assign one to each round
      </div>

      {/* ── Round assignment ─────────────────────────────────────────────── */}
      <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", padding: "14px 16px", marginBottom: "18px" }}>
        <Label>Rounds</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
          {ROUNDS.map((r) => {
            const cid = rounds[r]?.courseId;
            const c = cid ? library[cid] || event.courses?.[cid] : null;
            return (
              <div key={r} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: CREAM, minWidth: "62px" }}>Round {r}</span>
                <select value={cid || ""} onChange={(e) => assignRound(r, e.target.value)} style={{ ...inputStyle, flex: 1, cursor: "pointer" }}>
                  <option value="">— not assigned —</option>
                  {libList.map((lc) => <option key={lc.id} value={lc.id}>{lc.name || "Unnamed"}</option>)}
                </select>
                {c && <span style={{ fontSize: "12px", color: M, whiteSpace: "nowrap" }}>Par {parTotal(c)}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Library list ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <Label>Course Library ({libList.length})</Label>
        {editingId === null && <button onClick={startNew} style={btnStyle}>+ Add Course</button>}
      </div>

      {editingId === null && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
          {libList.length === 0 && <div style={{ color: M, fontSize: "13px", padding: "10px 0" }}>No courses yet — add one to get started.</div>}
          {libList.map((c) => {
            const usedIn = ROUNDS.filter((r) => rounds[r]?.courseId === c.id);
            return (
              <div key={c.id} style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "10px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: CREAM }}>{c.name || "Unnamed"}</div>
                  <div style={{ fontSize: "12px", color: M, marginTop: "2px" }}>
                    Par {parTotal(c)} · Slope {c.slope || 113} · Rating {c.rating || parTotal(c)}
                    {usedIn.length > 0 && <span style={{ color: G }}> · Round {usedIn.join(", ")}</span>}
                  </div>
                </div>
                <button onClick={() => startEdit(c.id)} style={smallBtn}>Edit</button>
                <button onClick={() => deleteCourse(c.id)} style={{ ...smallBtn, color: R, borderColor: R + "55" }}>Delete</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Course editor ────────────────────────────────────────────────── */}
      {editingId !== null && draft && (
        <div style={{ background: CARD2, border: `1px solid ${G}44`, borderRadius: "12px", padding: "16px", marginBottom: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <Label>Course Name</Label>
              <input value={draft.name || ""} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. Buck Hill Falls CC" style={inputStyle} />
            </div>
            <div>
              <Label>Slope Rating</Label>
              <input value={draft.slope || ""} onChange={(e) => setField("slope", parseFloat(e.target.value) || 0)} type="number" style={inputStyle} />
            </div>
            <div>
              <Label>Course Rating</Label>
              <input value={draft.rating || ""} onChange={(e) => setField("rating", parseFloat(e.target.value) || 0)} type="number" step="0.1" style={inputStyle} />
            </div>
          </div>

          {[{ label: "Front 9", start: 0 }, { label: "Back 9", start: 9 }].map(({ label, start }) => {
            const parSlice = (draft.par || DEFAULT_PAR).slice(start, start + 9);
            const siSlice = (draft.si || DEFAULT_SI).slice(start, start + 9);
            const halfPar = parSlice.reduce((a, b) => a + b, 0);
            const grid = { display: "grid", gridTemplateColumns: "30px repeat(9, 1fr)", gap: "4px", alignItems: "center" };
            return (
              <div key={label} style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
                  <Label>{label}</Label>
                  <span style={{ fontSize: "12px", color: M, fontWeight: 600 }}>Par {halfPar}</span>
                </div>
                <div style={grid}>
                  <div />
                  {Array.from({ length: 9 }, (_, i) => <div key={i} style={{ textAlign: "center", fontSize: "11px", color: M, fontWeight: 600 }}>{start + i + 1}</div>)}
                </div>
                <div style={{ ...grid, marginTop: "4px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD }}>Par</div>
                  {parSlice.map((p, i) => <input key={i} value={p || ""} onChange={(e) => setHole("par", start + i, e.target.value)} type="number" min="3" max="6" style={holeInput} />)}
                </div>
                <div style={{ ...grid, marginTop: "4px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD }}>SI</div>
                  {siSlice.map((s, i) => <input key={i} value={s || ""} onChange={(e) => setHole("si", start + i, e.target.value)} type="number" min="1" max="18" style={holeInput} />)}
                </div>
              </div>
            );
          })}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px" }}>
            <span style={{ fontSize: "12px", color: M }}>Total par: {parTotal(draft)}</span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={cancelEdit} style={{ ...smallBtn, padding: "10px 16px" }}>Cancel</button>
              <button onClick={saveCourse} style={btnStyle}>{editingId === "__new__" ? "Add to Library" : "Save Course"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>{children}</div>;
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: "8px",
  border: "1px solid rgba(201,168,76,0.2)", background: "rgba(26,61,36,0.15)",
  color: CREAM, fontSize: "14px", fontFamily: "'Inter','Helvetica Neue',sans-serif",
  outline: "none", boxSizing: "border-box",
};
const holeInput = {
  width: "100%", padding: "7px 2px", textAlign: "center", borderRadius: "6px",
  border: "1px solid rgba(201,168,76,0.2)", background: "rgba(26,61,36,0.2)",
  color: CREAM, fontSize: "14px", fontFamily: "'Inter','Helvetica Neue',sans-serif",
  outline: "none", boxSizing: "border-box",
};
const btnStyle = {
  padding: "10px 18px", borderRadius: "8px", border: "none", background: G,
  color: CREAM, fontFamily: "'Inter','Helvetica Neue',sans-serif",
  fontSize: "13px", fontWeight: 700, cursor: "pointer",
};
const smallBtn = {
  padding: "7px 12px", borderRadius: "7px", border: `1px solid ${GOLD}44`, background: "transparent",
  color: CREAM, fontFamily: FB, fontSize: "12px", fontWeight: 600, cursor: "pointer",
};
