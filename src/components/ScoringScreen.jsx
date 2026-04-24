import { useState, useEffect } from "react";
import { onSnapshot } from "firebase/firestore";
import { CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { playerCourseHcp, strokesOnHole, netHole, totalPar } from "../lib/golfLogic";
import { savePlayerScore, saveRoundCourse, updatePresence, clearPresence, PRESENCE_COL } from "../firebase/client";

export default function ScoringScreen({ event, saveEvent }) {
  const { players = [], courses = {}, rounds = {}, pairings = {} } = event;
  const [activeRound, setActiveRound] = useState(1);
  const [editingCell, setEditingCell] = useState(null); // { pid, hole }
  const [keypadInput, setKeypadInput] = useState("");
  const [activeGroup, setActiveGroup] = useState(0);
  const [activeScorerName, setActiveScorerName] = useState(() => localStorage.getItem("po_scorer") || "");
  const [livePresence, setLivePresence] = useState([]);

  const round = rounds[activeRound] || {};
  const course = courses[round.courseId || activeRound];
  const scores = round.scores || {};
  const groups = pairings[activeRound] || [players.map((p) => p.id)];
  const groupPlayers = (groups[activeGroup] || []).map((id) => players.find((p) => p.id === id)).filter(Boolean);

  // Listen to presence collection
  useEffect(() => {
    const unsub = onSnapshot(PRESENCE_COL, (snap) => {
      const now = Date.now();
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((d) => {
          // Only show presence from the last 2 minutes
          if (!d.ts) return false;
          const age = now - d.ts.toMillis();
          return age < 120000;
        });
      setLivePresence(docs);
    }, () => {});
    return unsub;
  }, []);

  // Update presence when editing
  useEffect(() => {
    if (editingCell && activeScorerName) {
      updatePresence(activeScorerName, activeRound, activeGroup, editingCell.hole + 1);
    }
  }, [editingCell, activeRound, activeGroup, activeScorerName]);

  // Clear presence on unmount
  useEffect(() => {
    return () => clearPresence();
  }, []);

  // Concurrent-safe score write using dot-notation field paths
  async function setScore(pid, holeIdx, val) {
    const v = parseInt(val);
    const playerScores = [...(scores[pid] || Array(18).fill(0))];
    playerScores[holeIdx] = isNaN(v) || v < 0 ? 0 : v;

    // Optimistic local update
    const updated = {
      ...event,
      rounds: {
        ...rounds,
        [activeRound]: {
          ...round,
          courseId: round.courseId || activeRound,
          scores: { ...scores, [pid]: playerScores },
        },
      },
    };
    saveEvent(updated, true); // true = local-only, skip Firestore write

    // Write just this player's scores via dot-notation (concurrent-safe)
    try {
      await savePlayerScore(activeRound, pid, playerScores, round.courseId || activeRound);
    } catch (e) {
      console.warn("Score save queued offline:", e.message);
    }
  }

  function stepScore(pid, holeIdx, delta) {
    const current = (scores[pid] || [])[holeIdx] || 0;
    const par = course?.par?.[holeIdx] || 4;
    const next = current === 0 ? par + delta : current + delta;
    if (next < 1) return;
    if (next > 15) return;
    setScore(pid, holeIdx, next);
  }

  // Sync keypad display when active cell changes
  useEffect(() => {
    if (editingCell) {
      const current = (scores[editingCell.pid] || [])[editingCell.hole];
      setKeypadInput(current ? String(current) : "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingCell?.pid, editingCell?.hole]);

  function padDigit(d) {
    setKeypadInput((prev) => {
      const next = (prev + d).replace(/^0+/, "").slice(0, 2);
      const val = parseInt(next);
      if (!isNaN(val) && val > 0 && val <= 15) setScore(editingCell.pid, editingCell.hole, val);
      return next;
    });
  }

  function padBack() {
    setKeypadInput((prev) => {
      const next = prev.slice(0, -1);
      const val = parseInt(next) || 0;
      setScore(editingCell.pid, editingCell.hole, val);
      return next;
    });
  }

  function padDone() {
    setEditingCell(null);
    setKeypadInput("");
  }

  async function setRoundCourseHandler(cId) {
    // Optimistic local
    saveEvent({
      ...event,
      rounds: { ...rounds, [activeRound]: { ...round, courseId: cId } },
    }, true);
    try {
      await saveRoundCourse(activeRound, cId);
    } catch (e) {
      console.warn("Course save queued offline:", e.message);
    }
  }

  // Score color class based on net vs par
  function scoreClass(gross, par, chcp, si) {
    if (!gross) return "score-empty";
    const net = netHole(gross, chcp, si);
    const diff = net - par;
    if (diff <= -2) return "score-eagle";
    if (diff === -1) return "score-birdie";
    if (diff === 0) return "score-par";
    if (diff === 1) return "score-bogey";
    return "score-double";
  }

  // Running totals for a player
  function playerTotals(pid) {
    const ps = scores[pid] || [];
    const chcp = playerCourseHcp(players.find((p) => p.id === pid), course);
    let grossF = 0, netF = 0, grossB = 0, netB = 0;
    let countF = 0, countB = 0;
    for (let h = 0; h < 18; h++) {
      if (!ps[h]) continue;
      const net = netHole(ps[h], chcp, course.si[h]);
      if (h < 9) { grossF += ps[h]; netF += net; countF++; }
      else { grossB += ps[h]; netB += net; countB++; }
    }
    return {
      grossF, netF, grossB, netB, countF, countB,
      grossTotal: grossF + grossB,
      netTotal: netF + netB,
      countTotal: countF + countB,
    };
  }

  // Other scorers active right now (not me)
  const otherScorers = livePresence.filter((p) => p.name !== activeScorerName);

  const editing = editingCell;

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        Scoring
      </div>

      {/* Scorer name prompt */}
      {!activeScorerName && (
        <div style={{ background: CARD2, border: `1px solid ${GO}44`, borderRadius: "10px", padding: "14px", marginBottom: "14px" }}>
          <div style={{ fontSize: "13px", color: GO, marginBottom: "8px" }}>Who's scoring? (so others can see your activity)</div>
          <div style={{ display: "flex", gap: "8px" }}>
            {players.map((p) => (
              <button key={p.id} onClick={() => { setActiveScorerName(p.name); localStorage.setItem("po_scorer", p.name); }}
                className="btn" style={{ padding: "7px 14px" }}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Live presence indicator */}
      {otherScorers.length > 0 && (
        <div style={{
          background: G + "15", border: `1px solid ${G}33`, borderRadius: "8px",
          padding: "8px 12px", marginBottom: "12px", fontSize: "12px", color: CREAM,
          display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
        }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: G, animation: "pulse 2s infinite" }} />
          <span style={{ color: M }}>Also scoring:</span>
          {otherScorers.map((s) => (
            <span key={s.id} style={{ background: G + "22", padding: "2px 8px", borderRadius: "10px", fontSize: "11px" }}>
              {s.name} · R{s.round} G{s.group + 1} H{s.hole}
            </span>
          ))}
        </div>
      )}

      {/* Round tabs */}
      <div className="round-tabs">
        {[1, 2, 3].map((r) => (
          <button key={r} onClick={() => { setActiveRound(r); setEditingCell(null); }}
            className={`round-tab${activeRound === r ? " active" : ""}`}>
            Round {r}
          </button>
        ))}
      </div>

      {/* Course selector */}
      {!round.courseId && (
        <div style={{ background: CARD2, border: `1px solid ${GO}44`, borderRadius: "10px", padding: "12px 14px", marginBottom: "14px" }}>
          <div style={{ fontSize: "12px", color: GO, marginBottom: "8px" }}>Select course for Round {activeRound}:</div>
          <div style={{ display: "flex", gap: "8px" }}>
            {[1, 2, 3].map((cId) => (
              courses[cId] && (
                <button key={cId} onClick={() => setRoundCourseHandler(cId)} className="btn" style={{ padding: "7px 14px" }}>
                  {courses[cId].name || `Course ${cId}`}
                </button>
              )
            ))}
          </div>
        </div>
      )}

      {course ? (
        <>
          {/* Course info */}
          <div style={{ fontSize: "12px", color: M, marginBottom: "8px" }}>
            {course.name} · Par {totalPar(course)} · Slope {course.slope} · Rating {course.rating}
          </div>

          {/* Group selector */}
          {groups.length > 1 && (
            <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
              {groups.map((g, gi) => (
                <button key={gi} onClick={() => { setActiveGroup(gi); setEditingCell(null); }}
                  className={`round-tab${activeGroup === gi ? " active" : ""}`}>
                  Group {gi + 1}
                </button>
              ))}
            </div>
          )}


          {/* Scorecard grid */}
          <div className="card2">
            <div className="scorecard-wrap">
              <table className="scorecard">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", paddingLeft: "10px", position: "sticky", left: 0, background: CARD2, zIndex: 2 }}>Player</th>
                    {Array.from({ length: 9 }, (_, i) => (
                      <th key={i}>{i + 1}</th>
                    ))}
                    <th className="nine-sep" style={{ color: GO }}>OUT</th>
                    {Array.from({ length: 9 }, (_, i) => (
                      <th key={i + 9}>{i + 10}</th>
                    ))}
                    <th className="nine-sep" style={{ color: GO }}>IN</th>
                    <th style={{ color: GO }}>TOT</th>
                    <th style={{ color: G }}>NET</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Par row */}
                  <tr className="par-row">
                    <td style={{ textAlign: "left", paddingLeft: "10px", position: "sticky", left: 0, background: CARD2, zIndex: 1, color: GOLD, fontWeight: 600 }}>Par</td>
                    {course.par.slice(0, 9).map((p, i) => (
                      <td key={i}>{p}</td>
                    ))}
                    <td className="nine-sep total-cell" style={{ color: GOLD }}>{course.par.slice(0, 9).reduce((a, b) => a + b, 0)}</td>
                    {course.par.slice(9).map((p, i) => (
                      <td key={i + 9}>{p}</td>
                    ))}
                    <td className="nine-sep total-cell" style={{ color: GOLD }}>{course.par.slice(9).reduce((a, b) => a + b, 0)}</td>
                    <td className="total-cell" style={{ color: GOLD }}>{totalPar(course)}</td>
                    <td></td>
                  </tr>

                  {/* SI row */}
                  <tr className="si-row">
                    <td style={{ textAlign: "left", paddingLeft: "10px", fontSize: "10px", position: "sticky", left: 0, background: CARD2, zIndex: 1 }}>SI</td>
                    {course.si.slice(0, 9).map((s, i) => (
                      <td key={i}>{s}</td>
                    ))}
                    <td className="nine-sep"></td>
                    {course.si.slice(9).map((s, i) => (
                      <td key={i + 9}>{s}</td>
                    ))}
                    <td className="nine-sep"></td>
                    <td></td>
                    <td></td>
                  </tr>

                  {/* Player rows */}
                  {groupPlayers.map((p) => {
                    const chcp = playerCourseHcp(p, course);
                    const ps = scores[p.id] || [];
                    const totals = playerTotals(p.id);
                    const netVsPar = totals.countTotal > 0 ? totals.netTotal - course.par.slice(0, totals.countF > 0 && totals.countB > 0 ? 18 : totals.countF > 0 ? 9 : 18).reduce((a, b) => a + b, 0) : null;

                    return (
                      <tr key={p.id} style={{ borderBottom: `1px solid rgba(201,168,76,0.12)` }}>
                        <td className="player-name">
                          {p.name}
                          <span style={{ fontSize: "10px", color: GOLD, marginLeft: "6px" }}>{chcp}</span>
                        </td>
                        {Array.from({ length: 9 }, (_, h) => {
                          const gross = ps[h] || 0;
                          const isEditing = editing?.pid === p.id && editing?.hole === h;
                          return (
                            <td key={h}
                              className={`hole-cell ${isEditing ? "active" : ""} ${scoreClass(gross, course.par[h], chcp, course.si[h])}`}
                              onClick={() => setEditingCell({ pid: p.id, hole: h })}>
                              {gross || "·"}
                            </td>
                          );
                        })}
                        <td className="nine-sep total-cell" style={{ color: totals.countF > 0 ? CREAM : M }}>
                          {totals.countF > 0 ? totals.grossF : "—"}
                        </td>
                        {Array.from({ length: 9 }, (_, i) => {
                          const h = i + 9;
                          const gross = ps[h] || 0;
                          const isEditing = editing?.pid === p.id && editing?.hole === h;
                          return (
                            <td key={h}
                              className={`hole-cell ${isEditing ? "active" : ""} ${scoreClass(gross, course.par[h], chcp, course.si[h])}`}
                              onClick={() => setEditingCell({ pid: p.id, hole: h })}>
                              {gross || "·"}
                            </td>
                          );
                        })}
                        <td className="nine-sep total-cell" style={{ color: totals.countB > 0 ? CREAM : M }}>
                          {totals.countB > 0 ? totals.grossB : "—"}
                        </td>
                        <td className="total-cell" style={{ color: totals.countTotal > 0 ? CREAM : M }}>
                          {totals.countTotal > 0 ? totals.grossTotal : "—"}
                        </td>
                        <td className="total-cell" style={{
                          color: totals.countTotal > 0
                            ? (netVsPar < 0 ? R : netVsPar === 0 ? G : CREAM)
                            : M,
                        }}>
                          {totals.countTotal > 0 ? totals.netTotal : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ padding: "8px 14px", borderTop: `1px solid rgba(255,255,255,0.06)`, fontSize: "11px", color: M }}>
              Tap a cell to enter score · Net = Gross − Course HCP ({groupPlayers.length > 0 ? "USGA" : ""})
            </div>
          </div>
        </>
      ) : (
        <div style={{ textAlign: "center", color: M, padding: "40px 0", fontSize: "14px" }}>
          Set up courses first, then assign a course to Round {activeRound}.
        </div>
      )}

      {/* Numeric keypad overlay */}
      {editing && course && (() => {
        const p = players.find((pl) => pl.id === editing.pid);
        if (!p) return null;
        const h = editing.hole;
        const par = course.par[h] || 4;
        const si = course.si[h] || (h + 1);
        const chcp = playerCourseHcp(p, course);
        const strokes = strokesOnHole(chcp, si);
        const gross = parseInt(keypadInput) || 0;
        const net = gross ? netHole(gross, chcp, si) : null;
        const vsPar = net !== null ? net - par : null;

        return (
          <>
            {/* Backdrop */}
            <div onClick={padDone} style={{ position: "fixed", inset: 0, zIndex: 199, background: "rgba(0,0,0,0.25)" }} />

            {/* Bottom sheet */}
            <div style={{
              position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
              background: "#fff", borderRadius: "18px 18px 0 0",
              boxShadow: "0 -4px 24px rgba(0,0,0,0.18)",
              borderTop: `3px solid ${G}`,
            }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px 10px", borderBottom: `1px solid #d0d8d0` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: CREAM }}>{p.name}</div>
                  <div style={{ fontSize: "12px", color: M, marginTop: "2px" }}>
                    Hole {h + 1} · Par {par} · SI {si}
                    {strokes > 0 ? ` · +${strokes} stroke${strokes > 1 ? "s" : ""}` : ""}
                  </div>
                </div>

                {/* Score + net display */}
                <div style={{ textAlign: "center", minWidth: "80px" }}>
                  <div style={{ fontSize: "42px", fontWeight: 800, color: CREAM, lineHeight: 1, fontFamily: FB }}>
                    {keypadInput || "—"}
                  </div>
                  {net !== null ? (
                    <div style={{ fontSize: "12px", marginTop: "2px", color: vsPar < 0 ? R : vsPar === 0 ? G : M, fontWeight: 600 }}>
                      Net {net} · {vsPar === 0 ? "E" : vsPar > 0 ? `+${vsPar}` : vsPar}
                    </div>
                  ) : (
                    <div style={{ fontSize: "11px", color: M }}>enter score</div>
                  )}
                </div>

                {/* Stepper for fine-tuning */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <button onClick={() => { stepScore(p.id, h, 1); setKeypadInput(String(Math.min((parseInt(keypadInput) || 0) + 1, 15))); }}
                    style={stepBtn}>+</button>
                  <button onClick={() => { stepScore(p.id, h, -1); setKeypadInput((prev) => { const n = Math.max((parseInt(prev) || 0) - 1, 1); return String(n); }); }}
                    style={stepBtn}>−</button>
                </div>
              </div>

              {/* Numpad grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1px", background: "#d0d8d0", margin: "0" }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                  <button key={d} onClick={() => padDigit(String(d))} style={padBtn}>{d}</button>
                ))}
                <button onClick={padBack} style={{ ...padBtn, fontSize: "22px", color: M }}>⌫</button>
                <button onClick={() => padDigit("0")} style={padBtn}>0</button>
                <button onClick={padDone} style={{ ...padBtn, background: G, color: "#fff", fontWeight: 800, fontSize: "22px" }}>✓</button>
              </div>

              {/* Safe area spacer (iOS home bar) */}
              <div style={{ height: "env(safe-area-inset-bottom, 8px)", background: "#fff" }} />
            </div>
          </>
        );
      })()}
    </div>
  );
}

const ghostBtn = {
  padding: "6px 14px", borderRadius: "7px",
  border: "1px solid rgba(201,168,76,0.3)",
  background: "transparent", color: "#8a9e8c",
  fontFamily: "'Inter','Helvetica Neue',sans-serif",
  fontSize: "13px", cursor: "pointer",
};

const padBtn = {
  padding: "0", height: "64px",
  border: "none", background: "#f8f9f6",
  color: "#1a1f1a", fontFamily: "'Inter','Helvetica Neue',sans-serif",
  fontSize: "26px", fontWeight: 600, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};

const stepBtn = {
  width: "38px", height: "38px", borderRadius: "8px",
  border: "1px solid #c8d0c8", background: "#f2f4f0",
  color: "#1a6b3a", fontSize: "20px", fontWeight: 700,
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: "'Inter','Helvetica Neue',sans-serif",
};
