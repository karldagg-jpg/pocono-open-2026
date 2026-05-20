import { useState } from "react";
import { CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { totalPar } from "../lib/golfLogic";

const DEFAULT_PAR      = [4,4,3,5,4,3,4,5,4, 4,4,3,5,4,3,4,5,4];
const DEFAULT_SI       = [1,5,13,3,9,17,7,11,15, 2,6,14,4,10,18,8,12,16];
const DEFAULT_NINE_PAR = [4,4,3,5,4,3,4,5,4];
const DEFAULT_NINE_SI  = [1,3,9,5,7,2,8,4,6];
const NINE_KEYS   = ['red', 'blue', 'white'];
const NINE_LABELS = { red: 'Red', blue: 'Blue', white: 'White' };

// Interleave SI so nine1 gets odd ranks (1,3,5…17) and nine2 gets even ranks (2,4,6…18)
function computeNineSI(nines, selected) {
  const [k1, k2] = selected;
  const s1 = nines[k1]?.si || DEFAULT_NINE_SI;
  const s2 = nines[k2]?.si || DEFAULT_NINE_SI;
  const out = new Array(18);
  s1.forEach((r, h) => { out[h]     = 2 * r - 1; });
  s2.forEach((r, h) => { out[9 + h] = 2 * r; });
  return out;
}

function computeNinePar(nines, selected) {
  const [k1, k2] = selected;
  return [...(nines[k1]?.par || DEFAULT_NINE_PAR), ...(nines[k2]?.par || DEFAULT_NINE_PAR)];
}

const DEFAULT_NINES = {
  red:   { par: [...DEFAULT_NINE_PAR], si: [...DEFAULT_NINE_SI] },
  blue:  { par: [...DEFAULT_NINE_PAR], si: [...DEFAULT_NINE_SI] },
  white: { par: [...DEFAULT_NINE_PAR], si: [...DEFAULT_NINE_SI] },
};

export default function CourseScreen({ event, saveEvent }) {
  const courses = event.courses || {};
  const [activeRound, setActiveRound] = useState(1);
  const course = courses[activeRound] || { name: "", slope: 113, rating: 72.0, par: [...DEFAULT_PAR], si: [...DEFAULT_SI] };
  const [draft, setDraft] = useState(null);
  const [activeNine, setActiveNine] = useState('red');
  const editing = draft || course;

  const isThreeNine = !!(editing.nines);
  const selectedNines = editing.selectedNines || ['red', 'blue'];

  function field(key, val) { setDraft({ ...editing, [key]: val }); }

  function setHole(arr, i, val) {
    const key = arr === editing.par ? "par" : "si";
    const next = [...arr]; next[i] = parseInt(val) || 0;
    setDraft({ ...editing, [key]: next });
  }

  function enableThreeNine() {
    const nines = editing.nines || DEFAULT_NINES;
    const sel   = editing.selectedNines || ['red', 'blue'];
    setDraft({ ...editing, nines, selectedNines: sel, par: computeNinePar(nines, sel), si: computeNineSI(nines, sel) });
  }

  function disableThreeNine() {
    const { nines, selectedNines, ...rest } = editing;
    setDraft({ ...rest, par: [...DEFAULT_PAR], si: [...DEFAULT_SI] });
  }

  function toggleNineSelect(key) {
    let sel = [...selectedNines];
    if (sel.includes(key)) {
      if (sel.length <= 2) return; // can't go below 2
      sel = sel.filter(k => k !== key);
    } else {
      sel = sel.length < 2 ? [...sel, key] : [sel[0], key]; // replace second slot
    }
    const nines = editing.nines || DEFAULT_NINES;
    setDraft({ ...editing, selectedNines: sel, par: computeNinePar(nines, sel), si: computeNineSI(nines, sel) });
  }

  function setNineHole(nineKey, field, i, val) {
    const nines = { ...editing.nines };
    const nine  = { ...nines[nineKey], [field]: [...(nines[nineKey]?.[field] || DEFAULT_NINE_PAR)] };
    nine[field][i] = parseInt(val) || 0;
    nines[nineKey] = nine;
    const sel = editing.selectedNines || ['red', 'blue'];
    setDraft({ ...editing, nines, par: computeNinePar(nines, sel), si: computeNineSI(nines, sel) });
  }

  function save() {
    if (isThreeNine && selectedNines.length !== 2) {
      alert("Select exactly 2 nines before saving.");
      return;
    }
    const c  = editing;
    const tp = (c.par || DEFAULT_PAR).reduce((a, b) => a + b, 0);
    const saved = { par: [...DEFAULT_PAR], si: [...DEFAULT_SI], slope: 113, rating: tp, ...c };
    if (!saved.slope)  saved.slope  = 113;
    if (!saved.rating) saved.rating = tp;
    const newCourses = { ...courses, [activeRound]: saved };
    saveEvent({ ...event, courses: newCourses }, { courses: newCourses });
    setDraft(null);
  }

  const tp = (editing.par || DEFAULT_PAR).reduce((a, b) => a + b, 0);

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
            <button key={r} onClick={() => { setActiveRound(r); setDraft(null); }} style={{
              flex: 1, padding: "10px", borderRadius: "10px",
              border: `1px solid ${activeRound === r ? G : GOLD + "33"}`,
              background: activeRound === r ? G + "22" : "transparent",
              color: activeRound === r ? CREAM : M,
              fontFamily: FB, fontSize: "13px", fontWeight: 600, cursor: "pointer",
            }}>
              <div>Round {r}</div>
              <div style={{ fontSize: "11px", marginTop: "2px", color: c ? G : M }}>
                {c ? (c.nines ? `${NINE_LABELS[c.selectedNines?.[0]] || '?'} + ${NINE_LABELS[c.selectedNines?.[1]] || '?'}` : c.name || "Unnamed") : "Not set"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Course form */}
      <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", padding: "16px", marginBottom: "14px" }}>

        {/* Name + Slope + Rating */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <Label>Course Name</Label>
            <input value={editing.name || ""} onChange={(e) => field("name", e.target.value)} placeholder="e.g. Buck Hill Golf Club" style={inputStyle} />
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

        {/* Three-nine toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", padding: "10px 12px", background: isThreeNine ? G + "15" : "transparent", borderRadius: "8px", border: `1px solid ${isThreeNine ? G + "44" : GOLD + "22"}` }}>
          <input type="checkbox" checked={isThreeNine} onChange={e => e.target.checked ? enableThreeNine() : disableThreeNine()}
            style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: G }} />
          <div style={{ fontSize: "13px", color: isThreeNine ? CREAM : M, fontWeight: isThreeNine ? 600 : 400 }}>
            Three-nine course (Red / Blue / White)
          </div>
        </div>

        {isThreeNine ? (
          <>
            {/* Nine selector */}
            <div style={{ marginBottom: "14px" }}>
              <Label>Select 2 nines to play</Label>
              <div style={{ display: "flex", gap: "8px" }}>
                {NINE_KEYS.map(key => {
                  const sel = selectedNines.includes(key);
                  const nineIdx = selectedNines.indexOf(key);
                  return (
                    <button key={key} onClick={() => toggleNineSelect(key)} style={{
                      flex: 1, padding: "10px 6px", borderRadius: "9px", cursor: "pointer",
                      border: `2px solid ${sel ? G : "#c8d0c8"}`,
                      background: sel ? G + "18" : "transparent",
                      color: sel ? G : M, fontFamily: FB, fontSize: "13px", fontWeight: sel ? 700 : 400,
                    }}>
                      {sel ? `${nineIdx + 1}. ` : ""}{NINE_LABELS[key]}
                      {sel && <div style={{ fontSize: "10px", fontWeight: 400 }}>Holes {nineIdx === 0 ? "1–9" : "10–18"}</div>}
                    </button>
                  );
                })}
              </div>
              {selectedNines.length === 2 && (
                <div style={{ fontSize: "11px", color: M, marginTop: "6px" }}>
                  Playing {NINE_LABELS[selectedNines[0]]} (holes 1–9) + {NINE_LABELS[selectedNines[1]]} (holes 10–18) · Par {tp}
                </div>
              )}
            </div>

            {/* Nine editor tabs */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
              {NINE_KEYS.map(key => (
                <button key={key} onClick={() => setActiveNine(key)} style={{
                  flex: 1, padding: "7px", borderRadius: "8px", cursor: "pointer",
                  border: `1px solid ${activeNine === key ? G : GOLD + "33"}`,
                  background: activeNine === key ? G + "22" : "transparent",
                  color: activeNine === key ? CREAM : M, fontFamily: FB, fontSize: "12px", fontWeight: 600,
                }}>
                  {NINE_LABELS[key]}
                </button>
              ))}
            </div>

            {/* Active nine hole editor */}
            {(() => {
              const nine = editing.nines?.[activeNine] || { par: [...DEFAULT_NINE_PAR], si: [...DEFAULT_NINE_SI] };
              const ninePar = nine.par || DEFAULT_NINE_PAR;
              const nineSI  = nine.si  || DEFAULT_NINE_SI;
              const nineSum = ninePar.reduce((a, b) => a + b, 0);
              const grid = { display: "grid", gridTemplateColumns: "30px repeat(9, 1fr)", gap: "4px", alignItems: "center" };
              return (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <Label>{NINE_LABELS[activeNine]} Nine</Label>
                    <span style={{ fontSize: "12px", color: M, fontWeight: 600 }}>Par {nineSum}</span>
                  </div>
                  <div style={grid}>
                    <div />
                    {Array.from({ length: 9 }, (_, i) => (
                      <div key={i} style={{ textAlign: "center", fontSize: "11px", color: M, fontWeight: 600 }}>{i + 1}</div>
                    ))}
                  </div>
                  <div style={{ ...grid, marginTop: "4px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD }}>Par</div>
                    {ninePar.map((p, i) => (
                      <input key={i} value={p || ""} onChange={e => setNineHole(activeNine, 'par', i, e.target.value)}
                        type="number" min="3" max="6" style={holeInput} />
                    ))}
                  </div>
                  <div style={{ ...grid, marginTop: "4px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD }}>SI</div>
                    {nineSI.map((s, i) => (
                      <input key={i} value={s || ""} onChange={e => setNineHole(activeNine, 'si', i, e.target.value)}
                        type="number" min="1" max="9" style={holeInput} />
                    ))}
                  </div>
                  <div style={{ fontSize: "11px", color: M, marginTop: "8px" }}>
                    SI 1–9 within this nine · combined 18-hole SI is computed automatically
                  </div>
                </div>
              );
            })()}
          </>
        ) : (
          /* Standard 18-hole editor */
          [{label: "Front 9", start: 0}, {label: "Back 9", start: 9}].map(({ label, start }) => {
            const parSlice = (editing.par || DEFAULT_PAR).slice(start, start + 9);
            const siSlice  = (editing.si  || DEFAULT_SI ).slice(start, start + 9);
            const halfPar  = parSlice.reduce((a, b) => a + b, 0);
            const grid = { display: "grid", gridTemplateColumns: "30px repeat(9, 1fr)", gap: "4px", alignItems: "center" };
            return (
              <div key={label} style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
                  <Label>{label}</Label>
                  <span style={{ fontSize: "12px", color: M, fontWeight: 600 }}>Par {halfPar}</span>
                </div>
                <div style={grid}>
                  <div />
                  {Array.from({ length: 9 }, (_, i) => (
                    <div key={i} style={{ textAlign: "center", fontSize: "11px", color: M, fontWeight: 600 }}>{start + i + 1}</div>
                  ))}
                </div>
                <div style={{ ...grid, marginTop: "4px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD }}>Par</div>
                  {parSlice.map((p, i) => (
                    <input key={i} value={p || ""} onChange={e => setHole(editing.par || DEFAULT_PAR, start + i, e.target.value)}
                      type="number" min="3" max="6" style={holeInput} />
                  ))}
                </div>
                <div style={{ ...grid, marginTop: "4px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD }}>SI</div>
                  {siSlice.map((s, i) => (
                    <input key={i} value={s || ""} onChange={e => setHole(editing.si || DEFAULT_SI, start + i, e.target.value)}
                      type="number" min="1" max="18" style={holeInput} />
                  ))}
                </div>
              </div>
            );
          })
        )}

        <div style={{ marginTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: M }}>Total par: {tp}</span>
          <button onClick={save} style={btnStyle}>Save Round {activeRound}</button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: "5px" }}>{children}</div>;
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
  padding: "10px 22px", borderRadius: "8px", border: "none", background: G,
  color: CREAM, fontFamily: "'Inter','Helvetica Neue',sans-serif",
  fontSize: "13px", fontWeight: 700, cursor: "pointer",
};
