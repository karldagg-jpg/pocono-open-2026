import { useState } from "react";
import { CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { playerCourseHcp, strokesOnHole, netHole, totalPar } from "../lib/golfLogic";

export default function ScoringScreen({ event, saveEvent }) {
  const { players = [], courses = {}, rounds = {}, pairings = {} } = event;
  const [activeRound, setActiveRound] = useState(1);
  const [editingCell, setEditingCell] = useState(null); // { pid, hole }
  const [activeGroup, setActiveGroup] = useState(0);

  const round = rounds[activeRound] || {};
  const course = courses[round.courseId || activeRound];
  const scores = round.scores || {};
  const groups = pairings[activeRound] || [players.map((p) => p.id)];
  const groupPlayers = (groups[activeGroup] || []).map((id) => players.find((p) => p.id === id)).filter(Boolean);

  function setScore(pid, holeIdx, val) {
    const v = parseInt(val);
    const playerScores = [...(scores[pid] || Array(18).fill(0))];
    playerScores[holeIdx] = isNaN(v) || v < 0 ? 0 : v;
    saveEvent({
      ...event,
      rounds: {
        ...rounds,
        [activeRound]: {
          ...round,
          courseId: round.courseId || activeRound,
          scores: { ...scores, [pid]: playerScores },
        },
      },
    });
  }

  function stepScore(pid, holeIdx, delta) {
    const current = (scores[pid] || [])[holeIdx] || 0;
    const par = course?.par?.[holeIdx] || 4;
    const next = current === 0 ? par + delta : current + delta;
    if (next < 1) return;
    if (next > 15) return;
    setScore(pid, holeIdx, next);
  }

  function setRoundCourse(cId) {
    saveEvent({
      ...event,
      rounds: { ...rounds, [activeRound]: { ...round, courseId: cId } },
    });
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

  const editing = editingCell;

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        Scoring
      </div>

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
                <button key={cId} onClick={() => setRoundCourse(cId)} className="btn" style={{ padding: "7px 14px" }}>
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

          {/* Stepper for active cell */}
          {editing && (() => {
            const p = players.find((pl) => pl.id === editing.pid);
            if (!p) return null;
            const h = editing.hole;
            const par = course.par[h] || 4;
            const si = course.si[h] || (h + 1);
            const chcp = playerCourseHcp(p, course);
            const strokes = strokesOnHole(chcp, si);
            const gross = (scores[p.id] || [])[h] || 0;
            const net = gross ? netHole(gross, chcp, si) : null;
            const vsPar = net !== null ? net - par : null;

            return (
              <div style={{
                background: CARD, border: `1px solid ${G}55`, borderRadius: "12px",
                padding: "14px", marginBottom: "14px",
                display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
              }}>
                <div style={{ flex: 1, minWidth: "120px" }}>
                  <div style={{ fontSize: "15px", color: CREAM, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: "12px", color: M }}>
                    Hole {h + 1} · Par {par} · SI {si}
                    {strokes > 0 ? ` · +${strokes} stroke${strokes > 1 ? "s" : ""}` : ""}
                  </div>
                </div>

                {/* Gross stepper */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "10px", color: M, marginBottom: "4px" }}>GROSS</div>
                  <div className="stepper">
                    <button onClick={() => stepScore(p.id, h, -1)}>−</button>
                    <div className="stepper-val">{gross || "—"}</div>
                    <button onClick={() => stepScore(p.id, h, 1)}>+</button>
                  </div>
                </div>

                {/* Net display */}
                <div style={{ textAlign: "center", minWidth: "50px" }}>
                  <div style={{ fontSize: "10px", color: M, marginBottom: "4px" }}>NET</div>
                  <div style={{
                    fontSize: "24px", fontWeight: 700,
                    color: net === null ? M : vsPar < 0 ? R : vsPar === 0 ? G : CREAM,
                  }}>
                    {net !== null ? net : "—"}
                  </div>
                  {vsPar !== null && (
                    <div style={{ fontSize: "11px", color: vsPar < 0 ? R : vsPar === 0 ? G : M }}>
                      {vsPar === 0 ? "E" : vsPar > 0 ? `+${vsPar}` : vsPar}
                    </div>
                  )}
                </div>

                <button onClick={() => setEditingCell(null)}
                  style={{ ...ghostBtn, padding: "6px 10px", fontSize: "11px", alignSelf: "flex-start" }}>
                  Done
                </button>
              </div>
            );
          })()}

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
