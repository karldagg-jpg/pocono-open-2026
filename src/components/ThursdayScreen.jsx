import { useState } from "react";
import { CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { strokesOnHole, playerCourseHcp } from "../lib/golfLogic";

// Sixies: pick 6 of 9 holes, 3 passes max, lowest net wins
// Returns true=forcedTake, false=forcedPass, null=freeChoice
function sixiesForced(takes, hi) {
  const passesUsed = takes.slice(0, hi).filter(x => x === false).length;
  const takesUsed  = takes.slice(0, hi).filter(x => x === true).length;
  if (takesUsed >= 6)                  return false;
  if (passesUsed >= 3)                 return true;
  if ((8 - hi) < (6 - takesUsed))     return true;
  return null;
}

const DEFAULT_COURSE = {
  par:    [4, 4, 3, 4, 5, 4, 3, 4, 4],
  si:     [1, 3, 9, 5, 7, 2, 8, 4, 6],
  slope:  113,
  rating: 35,
};

export default function ThursdayScreen({ event, saveEvent }) {
  const { players = [] } = event;
  const thu        = event.thursday || {};
  const course     = thu.course    || DEFAULT_COURSE;
  const playerIds  = thu.playerIds || [];
  const scores     = thu.scores    || {};
  const takes      = thu.takes     || {};
  const buyIn      = thu.buyIn     || 0;

  const [activeHole, setActiveHole] = useState(0);
  const [playersOpen, setPlayersOpen] = useState(playerIds.length === 0);
  const [courseOpen, setCourseOpen]   = useState(false);

  const selected = players.filter(p => playerIds.includes(p.id));
  const totalPar = course.par.reduce((a, b) => a + b, 0);

  // 9-hole rule: half the full course handicap, rounded
  function hcp9(p) { return Math.round(hcp9(p) / 2); }

  function saveThu(patch) {
    const newThu = { ...thu, ...patch };
    saveEvent({ ...event, thursday: newThu }, { thursday: newThu });
  }

  function togglePlayer(id) {
    const newIds = playerIds.includes(id)
      ? playerIds.filter(x => x !== id)
      : [...playerIds, id];
    saveThu({ playerIds: newIds });
  }

  function stepScore(pid, hi, delta) {
    const current = scores[pid]?.[hi] || 0;
    const par = course.par[hi] || 4;
    const next = current === 0 ? par + delta : current + delta;
    if (next < 1 || next > 15) return;
    const ps = [...(scores[pid] || Array(9).fill(null))];
    ps[hi] = next;
    saveThu({ scores: { ...scores, [pid]: ps } });
  }

  function setTake(pid, hi, val) {
    const pt = [...(takes[pid] || Array(9).fill(null))];
    if (sixiesForced(pt, hi) !== null) return; // forced, ignore tap
    pt[hi] = pt[hi] === val ? null : val; // toggle off if tapping same
    saveThu({ takes: { ...takes, [pid]: pt } });
  }

  function getEffective(pid, hi) {
    const chosen = takes[pid]?.[hi];
    if (chosen !== null && chosen !== undefined) return chosen;
    return sixiesForced(takes[pid] || Array(9).fill(null), hi);
  }

  function sixiesScore(pid) {
    const p = players.find(x => x.id === pid);
    if (!p) return null;
    const chcp = hcp9(p);
    let total = 0, any = false;
    for (let hi = 0; hi < 9; hi++) {
      if (getEffective(pid, hi) !== true) continue;
      const gross = scores[pid]?.[hi];
      if (!gross) continue;
      any = true;
      total += gross - strokesOnHole(chcp, course.si[hi]);
    }
    return any ? total : null;
  }

  function sixiesTaken(pid)  { return Array(9).fill(0).filter((_, hi) => getEffective(pid, hi) === true).length; }
  function sixiesPasses(pid) { return (takes[pid] || []).filter(v => v === false).length; }

  const par = course.par[activeHole] || 4;
  const si  = course.si[activeHole]  || (activeHole + 1);

  const results = selected
    .map(p => ({ p, score: sixiesScore(p.id), taken: sixiesTaken(p.id) }))
    .filter(x => x.score !== null)
    .sort((a, b) => a.score - b.score);

  const pot = buyIn * playerIds.length;
  const bestScore = results[0]?.score ?? null;
  const winners = results.filter(r => r.score === bestScore);
  const winnerPayout = pot > 0 && winners.length > 0 ? Math.floor(pot / winners.length) : 0;

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "22px 14px", paddingBottom: "40px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "2px" }}>
        Thursday Sixies
      </div>
      <div style={{ fontSize: "13px", color: M, marginBottom: "18px" }}>
        The Hideout · 9 holes · pick 6, 3 passes · lowest net wins
      </div>

      {/* Player picker */}
      <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", marginBottom: "14px", overflow: "hidden" }}>
        <button
          onClick={() => setPlayersOpen(v => !v)}
          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", fontFamily: FB }}>
          <span style={{ fontSize: "12px", color: M, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Players ({playerIds.length} selected)
          </span>
          <span style={{ color: M, fontSize: "12px" }}>{playersOpen ? "▲" : "▼"}</span>
        </button>
        {playersOpen && (
          <div style={{ padding: "0 14px 14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "6px", marginBottom: "12px" }}>
              {players.map(p => {
                const sel = playerIds.includes(p.id);
                const chcp = hcp9(p);
                return (
                  <button key={p.id} onClick={() => togglePlayer(p.id)} style={{
                    padding: "10px 12px", borderRadius: "9px", textAlign: "left", cursor: "pointer",
                    border: `2px solid ${sel ? G : "#c8d0c8"}`,
                    background: sel ? G + "18" : "#fff",
                    color: sel ? G : CREAM,
                    fontFamily: FB, fontSize: "13px", fontWeight: sel ? 700 : 400,
                  }}>
                    {sel ? "✓ " : ""}{p.name}
                    <span style={{ fontSize: "11px", color: sel ? G : M, display: "block", fontWeight: 400 }}>
                      {p.hcpIndex.toFixed(1)} idx · {chcp} chcp
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "10px", borderTop: "1px solid #e8ede8" }}>
              <span style={{ fontSize: "12px", color: M }}>Buy-in</span>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "14px", color: M }}>$</span>
                <input
                  type="number" min="0" step="1" value={buyIn || ""}
                  onChange={e => saveThu({ buyIn: Number(e.target.value) || 0 })}
                  placeholder="0"
                  style={{ width: "70px", padding: "6px 8px", borderRadius: "7px", border: "1px solid #c8d0c8", background: "#fff", color: CREAM, fontSize: "14px", fontWeight: 700, outline: "none", textAlign: "center" }}
                />
              </div>
              <span style={{ fontSize: "12px", color: M }}>per player</span>
              {pot > 0 && (
                <span style={{ fontSize: "13px", fontWeight: 700, color: GO, marginLeft: "4px" }}>${pot} pot</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Course setup */}
      <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", marginBottom: "16px", overflow: "hidden" }}>
        <button
          onClick={() => setCourseOpen(v => !v)}
          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", fontFamily: FB }}>
          <span style={{ fontSize: "12px", color: M, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            The Hideout · Par {totalPar} · Slope {course.slope} · Rating {course.rating}
          </span>
          <span style={{ color: M, fontSize: "12px" }}>{courseOpen ? "▲" : "▼"}</span>
        </button>
        {courseOpen && (
          <CourseEditor course={course} onChange={c => { saveThu({ course: c }); setCourseOpen(false); }} />
        )}
      </div>

      {selected.length === 0 ? (
        <div style={{ textAlign: "center", color: M, padding: "40px 0", fontSize: "14px" }}>
          Select players above to start scoring.
        </div>
      ) : (
        <>
          {/* Hole navigation */}
          <div style={{ background: CARD, border: `1px solid #d0d8d0`, borderRadius: "12px", padding: "10px 12px", marginBottom: "14px" }}>
            <div style={{ display: "flex", gap: "4px" }}>
              {Array.from({ length: 9 }, (_, h) => {
                const hasScore = selected.some(p => scores[p.id]?.[h]);
                const isActive = h === activeHole;
                return (
                  <button key={h} onClick={() => setActiveHole(h)} style={{
                    flex: 1, padding: "7px 2px", borderRadius: "7px",
                    fontFamily: FB, fontSize: "13px", fontWeight: isActive ? 700 : 500,
                    cursor: "pointer", border: "none", touchAction: "manipulation",
                    background: isActive ? G : hasScore ? G + "18" : CARD2,
                    color: isActive ? "#fff" : hasScore ? G : M,
                    boxShadow: isActive ? `0 0 0 2px ${G}44` : "none",
                  }}>
                    {h + 1}
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: "8px", fontSize: "11px", color: M, textAlign: "center" }}>
              Hole {activeHole + 1} · Par {par} · SI {si}
            </div>
          </div>

          {/* Per-player scoring + T/P */}
          <div style={{
            display: "grid",
            gridTemplateColumns: selected.length <= 2 ? "1fr 1fr" : "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "10px",
            marginBottom: "20px",
          }}>
            {selected.map(p => {
              const chcp    = hcp9(p);
              const strokes = strokesOnHole(chcp, si);
              const gross   = scores[p.id]?.[activeHole] || 0;
              const net     = gross ? gross - strokes : null;
              const eff     = getEffective(p.id, activeHole);
              const forced  = sixiesForced(takes[p.id] || Array(9).fill(null), activeHole);
              const taken   = sixiesTaken(p.id);
              const passes  = sixiesPasses(p.id);

              return (
                <div key={p.id} style={{
                  background: CARD,
                  border: `1px solid ${eff === true ? G + "66" : eff === false ? R + "33" : "#d0d8d0"}`,
                  borderRadius: "12px", padding: "12px 14px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: CREAM }}>{p.name.split(" ")[0]}</div>
                      <div style={{ fontSize: "10px", color: M }}>chcp {chcp}{strokes > 0 ? ` · +${strokes}` : ""}</div>
                    </div>
                    <div style={{ fontSize: "10px", color: M, textAlign: "right" }}>
                      {taken}/6 taken<br />{passes}/3 pass
                    </div>
                  </div>

                  {/* Score stepper */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <button onClick={() => stepScore(p.id, activeHole, -1)} style={stepBtn}>−</button>
                    <div style={{ flex: 1, textAlign: "center" }}>
                      {strokes > 0 && (
                        <div style={{ fontSize: "11px", color: "#28b45a", fontWeight: 700, lineHeight: 1 }}>{"•".repeat(strokes)}</div>
                      )}
                      <div style={{ fontSize: "28px", fontWeight: 700, color: gross ? CREAM : M, lineHeight: 1 }}>
                        {gross || "—"}
                      </div>
                      {net !== null && <div style={{ fontSize: "11px", color: M }}>net {net}</div>}
                    </div>
                    <button onClick={() => stepScore(p.id, activeHole, 1)} style={stepBtn}>+</button>
                  </div>

                  {/* Take / Pass */}
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={() => setTake(p.id, activeHole, true)}
                      style={{
                        flex: 1, padding: "8px", borderRadius: "8px", fontFamily: FB,
                        fontSize: "12px", fontWeight: 700,
                        cursor: forced === false ? "default" : "pointer",
                        border: `2px solid ${eff === true ? G : "#c8d0c8"}`,
                        background: eff === true ? G + "22" : "transparent",
                        color: eff === true ? G : forced === false ? "#c8d0c8" : M,
                        opacity: forced === false ? 0.4 : 1,
                      }}>
                      Take
                    </button>
                    <button
                      onClick={() => setTake(p.id, activeHole, false)}
                      style={{
                        flex: 1, padding: "8px", borderRadius: "8px", fontFamily: FB,
                        fontSize: "12px", fontWeight: 700,
                        cursor: forced === true ? "default" : "pointer",
                        border: `2px solid ${eff === false ? R : "#c8d0c8"}`,
                        background: eff === false ? R + "18" : "transparent",
                        color: eff === false ? R : forced === true ? "#c8d0c8" : M,
                        opacity: forced === true ? 0.4 : 1,
                      }}>
                      Pass
                    </button>
                  </div>
                  {forced !== null && (
                    <div style={{ fontSize: "10px", color: M, textAlign: "center", marginTop: "4px" }}>
                      forced {forced ? "take" : "pass"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Scorecard */}
          <div style={{ overflowX: "auto", marginBottom: "20px" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "420px", fontSize: "12px" }}>
              <thead>
                <tr>
                  <th style={th}>Player</th>
                  {Array.from({ length: 9 }, (_, h) => (
                    <th key={h} style={{ ...th, background: h === activeHole ? G + "22" : "transparent", color: h === activeHole ? G : M }}>
                      {h + 1}
                    </th>
                  ))}
                  <th style={th}>Tot</th>
                  <th style={{ ...th, color: GO }}>6s</th>
                </tr>
                <tr>
                  <td style={{ ...td, color: M, fontSize: "10px" }}>Par</td>
                  {course.par.map((p, h) => <td key={h} style={{ ...td, color: M, fontSize: "10px" }}>{p}</td>)}
                  <td style={{ ...td, color: M, fontSize: "10px" }}>{totalPar}</td>
                  <td style={td} />
                </tr>
              </thead>
              <tbody>
                {selected.map(p => {
                  const chcp      = hcp9(p);
                  const gross     = scores[p.id] || [];
                  const grossTot  = gross.reduce((s, v) => s + (v || 0), 0);
                  const s6        = sixiesScore(p.id);
                  return (
                    <tr key={p.id}>
                      <td style={{ ...td, fontWeight: 600, color: CREAM, whiteSpace: "nowrap" }}>{p.name.split(" ")[0]}</td>
                      {Array.from({ length: 9 }, (_, h) => {
                        const g      = gross[h] || 0;
                        const eff    = getEffective(p.id, h);
                        const strs   = strokesOnHole(chcp, course.si[h]);
                        const net    = g ? g - strs : null;
                        return (
                          <td key={h} onClick={() => setActiveHole(h)} style={{
                            ...td, cursor: "pointer",
                            background: eff === true ? G + "12" : eff === false ? R + "08" : "transparent",
                            color: g ? CREAM : M,
                            fontWeight: h === activeHole ? 700 : 400,
                            outline: h === activeHole ? `2px solid ${G}44` : "none",
                          }}>
                            {strs > 0 && <div style={{ fontSize: "9px", color: "#28b45a", fontWeight: 700, lineHeight: 1 }}>{"•".repeat(strs)}</div>}
                            {g || "—"}
                            {eff === true && net !== null && (
                              <div style={{ fontSize: "9px", color: G }}>{net}</div>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ ...td, fontWeight: 600, color: grossTot ? CREAM : M }}>{grossTot || "—"}</td>
                      <td style={{ ...td, fontWeight: 700, color: s6 !== null ? GO : M }}>{s6 !== null ? s6 : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="card2">
              <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: GO }}>Sixies Results</span>
                {pot > 0 && (
                  <span style={{ color: GO, fontSize: "13px" }}>
                    ${pot} pot{winners.length > 1 ? ` · split ${winners.length} ways` : ""}
                  </span>
                )}
              </div>
              {results.map(({ p, score, taken }, i) => {
                const isWinner = score === bestScore;
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", borderBottom: `1px solid ${GOLD}12` }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: isWinner ? GO : M, minWidth: "22px" }}>
                      {i === 0 || score !== results[i - 1].score ? i + 1 : ""}
                      {isWinner && winners.length > 1 ? "T" : ""}
                    </div>
                    <div style={{ flex: 1, fontSize: "14px", color: isWinner ? CREAM : M, fontWeight: isWinner ? 600 : 400 }}>{p.name}</div>
                    <div style={{ fontSize: "11px", color: M }}>{taken}/6</div>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: isWinner ? GO : M }}>{score}</div>
                    {pot > 0 && (
                      <div style={{ fontSize: "16px", fontWeight: 700, color: isWinner ? GO : M, minWidth: "52px", textAlign: "right" }}>
                        {isWinner ? `$${winnerPayout}` : "—"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CourseEditor({ course, onChange }) {
  const [draft, setDraft] = useState({ ...course, par: [...course.par], si: [...course.si] });

  function updateHole(key, hi, val) {
    const arr = [...draft[key]];
    arr[hi] = Number(val) || 0;
    setDraft(d => ({ ...d, [key]: arr }));
  }

  const totalPar = draft.par.reduce((a, b) => a + b, 0);

  return (
    <div style={{ padding: "0 14px 14px" }}>
      <div style={{ overflowX: "auto", marginBottom: "12px" }}>
        <table style={{ borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr>
              <th style={th}>Hole</th>
              {Array.from({ length: 9 }, (_, h) => <th key={h} style={th}>{h + 1}</th>)}
              <th style={th}>Tot</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...td, color: M, fontWeight: 600 }}>Par</td>
              {draft.par.map((v, h) => (
                <td key={h} style={td}>
                  <input type="number" min="3" max="5" value={v}
                    onChange={e => updateHole("par", h, e.target.value)}
                    style={cellInput} />
                </td>
              ))}
              <td style={{ ...td, fontWeight: 700, color: CREAM }}>{totalPar}</td>
            </tr>
            <tr>
              <td style={{ ...td, color: M, fontWeight: 600 }}>SI</td>
              {draft.si.map((v, h) => (
                <td key={h} style={td}>
                  <input type="number" min="1" max="9" value={v}
                    onChange={e => updateHole("si", h, e.target.value)}
                    style={cellInput} />
                </td>
              ))}
              <td style={td} />
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "12px", flexWrap: "wrap" }}>
        <label style={{ fontSize: "12px", color: M, display: "flex", alignItems: "center", gap: "6px" }}>
          Slope
          <input type="number" value={draft.slope} onChange={e => setDraft(d => ({ ...d, slope: Number(e.target.value) }))}
            style={{ width: "60px", padding: "5px 8px", borderRadius: "6px", border: "1px solid #c8d0c8", fontSize: "12px", color: CREAM, textAlign: "center", background: "#fff", outline: "none" }} />
        </label>
        <label style={{ fontSize: "12px", color: M, display: "flex", alignItems: "center", gap: "6px" }}>
          Rating
          <input type="number" step="0.1" value={draft.rating} onChange={e => setDraft(d => ({ ...d, rating: Number(e.target.value) }))}
            style={{ width: "60px", padding: "5px 8px", borderRadius: "6px", border: "1px solid #c8d0c8", fontSize: "12px", color: CREAM, textAlign: "center", background: "#fff", outline: "none" }} />
        </label>
      </div>
      <button onClick={() => onChange(draft)} style={{ padding: "8px 18px", borderRadius: "8px", border: "none", background: "#1a6b3a", color: "#f0ece0", fontFamily: "'Inter','Helvetica Neue',sans-serif", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
        Save Course
      </button>
    </div>
  );
}

const th       = { padding: "6px 8px", textAlign: "center", fontSize: "11px", color: M, fontWeight: 600, borderBottom: "1px solid #e8ede8" };
const td       = { padding: "6px 8px", textAlign: "center", borderBottom: "1px solid #f0f4f0" };
const stepBtn  = { width: "40px", height: "40px", borderRadius: "10px", border: "1px solid #c8d0c8", background: CARD2, color: CREAM, fontSize: "22px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "manipulation" };
const cellInput = { width: "36px", textAlign: "center", padding: "4px", borderRadius: "4px", border: "1px solid #c8d0c8", background: "#fff", fontSize: "12px", color: CREAM, outline: "none" };
