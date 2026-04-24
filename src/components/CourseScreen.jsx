import { useState } from "react";
import { CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { totalPar } from "../lib/golfLogic";

const DEFAULT_PAR = [4,4,3,5,4,3,4,5,4, 4,4,3,5,4,3,4,5,4];
const DEFAULT_SI  = [1,5,13,3,9,17,7,11,15, 2,6,14,4,10,18,8,12,16];

export default function CourseScreen({ event, saveEvent }) {
  const courses = event.courses || {};
  const [activeRound, setActiveRound] = useState(1);
  const course = courses[activeRound] || { name: "", slope: 113, rating: 72.0, par: [...DEFAULT_PAR], si: [...DEFAULT_SI] };
  const [draft, setDraft] = useState(null);
  const editing = draft || course;

  function field(key, val) {
    setDraft({ ...editing, [key]: val });
  }

  function setHole(arr, i, val) {
    const next = [...arr];
    next[i] = parseInt(val) || 0;
    setDraft({ ...editing, [arr === editing.par ? "par" : "si"]: next });
  }

  function save() {
    const c = draft || course;
    const newCourses = { ...courses, [activeRound]: c };
    saveEvent({ ...event, courses: newCourses }, { courses: newCourses });
    setDraft(null);
  }

  const tp = editing.par?.reduce((a, b) => a + b, 0) || 0;

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        Courses
      </div>
      <div style={{ color: M, fontSize: "14px", marginBottom: "18px" }}>
        Course details for each round · slope, rating, par &amp; stroke index
      </div>

      {/* Round tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "18px" }}>
        {[1, 2, 3].map((r) => {
          const c = courses[r];
          return (
            <button
              key={r}
              onClick={() => { setActiveRound(r); setDraft(null); }}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "10px",
                border: `1px solid ${activeRound === r ? G : GOLD + "33"}`,
                background: activeRound === r ? G + "22" : "transparent",
                color: activeRound === r ? CREAM : M,
                fontFamily: FB,
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <div>Round {r}</div>
              <div style={{ fontSize: "11px", marginTop: "2px", color: c ? G : M }}>
                {c ? c.name || "Unnamed" : "Not set"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Course form */}
      <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", padding: "16px", marginBottom: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <Label>Course Name</Label>
            <input value={editing.name || ""} onChange={(e) => field("name", e.target.value)} placeholder="e.g. Pocono Manor Resort" style={inputStyle} />
          </div>
          <div>
            <Label>Slope Rating</Label>
            <input value={editing.slope || ""} onChange={(e) => field("slope", parseFloat(e.target.value) || 0)} type="number" style={inputStyle} />
          </div>
          <div>
            <Label>Course Rating</Label>
            <input value={editing.rating || ""} onChange={(e) => field("rating", parseFloat(e.target.value) || 0)} type="number" step="0.1" style={inputStyle} />
          </div>
        </div>

        {/* Par row */}
        <Label>Par per hole · Total: {tp}</Label>
        <div style={{ overflowX: "auto", marginBottom: "10px" }}>
          <table style={{ borderCollapse: "collapse", minWidth: "700px", width: "100%" }}>
            <thead>
              <tr>
                <td style={thStyle}>Hole</td>
                {Array.from({ length: 18 }, (_, i) => (
                  <td key={i} style={{ ...thStyle, textAlign: "center" }}>{i + 1}</td>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdLabel}>Par</td>
                {(editing.par || DEFAULT_PAR).map((p, i) => (
                  <td key={i} style={{ padding: "2px" }}>
                    <input
                      value={p || ""}
                      onChange={(e) => setHole(editing.par || DEFAULT_PAR, i, e.target.value)}
                      type="number"
                      min="3" max="6"
                      style={holeInput}
                    />
                  </td>
                ))}
              </tr>
              <tr>
                <td style={tdLabel}>SI</td>
                {(editing.si || DEFAULT_SI).map((s, i) => (
                  <td key={i} style={{ padding: "2px" }}>
                    <input
                      value={s || ""}
                      onChange={(e) => setHole(editing.si || DEFAULT_SI, i, e.target.value)}
                      type="number"
                      min="1" max="18"
                      style={holeInput}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <button onClick={save} style={btnStyle}>Save Round {activeRound}</button>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: "5px" }}>{children}</div>;
}

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "8px",
  border: "1px solid rgba(201,168,76,0.2)",
  background: "rgba(26,61,36,0.15)",
  color: CREAM,
  fontSize: "14px",
  fontFamily: "'Inter','Helvetica Neue',sans-serif",
  outline: "none",
  boxSizing: "border-box",
};

const holeInput = {
  width: "34px",
  padding: "5px 2px",
  textAlign: "center",
  borderRadius: "5px",
  border: "1px solid rgba(201,168,76,0.15)",
  background: "rgba(26,61,36,0.2)",
  color: CREAM,
  fontSize: "12px",
  fontFamily: "'Inter','Helvetica Neue',sans-serif",
  outline: "none",
};

const thStyle = {
  padding: "5px 3px",
  fontSize: "10px",
  color: M,
  textAlign: "center",
  fontWeight: 600,
  letterSpacing: "0.05em",
};

const tdLabel = {
  padding: "5px 8px",
  fontSize: "11px",
  fontWeight: 700,
  color: GOLD,
  whiteSpace: "nowrap",
};

const btnStyle = {
  padding: "10px 22px",
  borderRadius: "8px",
  border: "none",
  background: G,
  color: CREAM,
  fontFamily: "'Inter','Helvetica Neue',sans-serif",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
};
