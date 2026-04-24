import { useState } from "react";
import { CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { playerCourseHcp, strokesOnHole, netHole, totalPar } from "../lib/golfLogic";

export default function ScoringScreen({ event, saveEvent }) {
  const { players = [], courses = {}, rounds = {}, pairings = {} } = event;
  const [activeRound, setActiveRound] = useState(1);
  const [activeHole, setActiveHole] = useState(0); // 0-indexed
  const [activeGroup, setActiveGroup] = useState(0);

  const round = rounds[activeRound] || {};
  const course = courses[round.courseId || activeRound];
  const scores = round.scores || {};
  const groups = pairings[activeRound] || [players.map((p) => p.id)]; // fallback: all in one group
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

  function setRoundCourse(cId) {
    saveEvent({
      ...event,
      rounds: { ...rounds, [activeRound]: { ...round, courseId: cId } },
    });
  }

  const hole = activeHole; // 0-indexed
  const par = course?.par?.[hole] || 4;
  const si = course?.si?.[hole] || (hole + 1);

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        Scoring
      </div>

      {/* Round tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
        {[1, 2, 3].map((r) => (
          <button key={r} onClick={() => setActiveRound(r)} style={{
            flex: 1, padding: "8px", borderRadius: "10px",
            border: `1px solid ${activeRound === r ? G : GOLD + "33"}`,
            background: activeRound === r ? G + "22" : "transparent",
            color: activeRound === r ? CREAM : M,
            fontFamily: FB, fontSize: "13px", fontWeight: 600, cursor: "pointer",
          }}>Round {r}</button>
        ))}
      </div>

      {/* Course selector for this round */}
      {!round.courseId && (
        <div style={{ background: CARD2, border: `1px solid ${GO}44`, borderRadius: "10px", padding: "12px 14px", marginBottom: "14px" }}>
          <div style={{ fontSize: "12px", color: GO, marginBottom: "8px" }}>Select course for Round {activeRound}:</div>
          <div style={{ display: "flex", gap: "8px" }}>
            {[1, 2, 3].map((cId) => (
              courses[cId] && (
                <button key={cId} onClick={() => setRoundCourse(cId)} style={{
                  padding: "7px 14px", borderRadius: "7px", border: `1px solid ${G}55`,
                  background: G + "22", color: CREAM, fontSize: "13px", cursor: "pointer", fontFamily: FB,
                }}>
                  {courses[cId].name || `Course ${cId}`}
                </button>
              )
            ))}
          </div>
        </div>
      )}

      {course ? (
        <>
          {/* Course info bar */}
          <div style={{ fontSize: "12px", color: M, marginBottom: "12px" }}>
            {course.name} · Par {totalPar(course)} · Slope {course.slope} · Rating {course.rating}
          </div>

          {/* Group selector */}
          {groups.length > 1 && (
            <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
              {groups.map((g, gi) => (
                <button key={gi} onClick={() => setActiveGroup(gi)} style={{
                  padding: "6px 14px", borderRadius: "8px",
                  border: `1px solid ${activeGroup === gi ? G : GOLD + "33"}`,
                  background: activeGroup === gi ? G + "22" : "transparent",
                  color: activeGroup === gi ? CREAM : M,
                  fontSize: "13px", fontFamily: FB, cursor: "pointer",
                }}>Group {gi + 1}</button>
              ))}
            </div>
          )}

          {/* Hole navigation */}
          <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", padding: "12px 14px", marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <button onClick={() => setActiveHole(Math.max(0, hole - 1))} disabled={hole === 0}
                style={{ ...navBtn, opacity: hole === 0 ? 0.3 : 1 }}>← Prev</button>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "22px", fontWeight: 700, color: CREAM }}>Hole {hole + 1}</div>
                <div style={{ fontSize: "12px", color: M }}>Par {par} · SI {si}</div>
              </div>
              <button onClick={() => setActiveHole(Math.min(17, hole + 1))} disabled={hole === 17}
                style={{ ...navBtn, opacity: hole === 17 ? 0.3 : 1 }}>Next →</button>
            </div>

            {/* Hole dots */}
            <div style={{ display: "flex", gap: "4px", justifyContent: "center", flexWrap: "wrap" }}>
              {Array.from({ length: 18 }, (_, h) => {
                const allScored = groupPlayers.every((p) => (scores[p.id] || [])[h] > 0);
                return (
                  <button key={h} onClick={() => setActiveHole(h)} style={{
                    width: "24px", height: "24px", borderRadius: "50%", border: `1px solid ${h === hole ? G : allScored ? G + "55" : GOLD + "33"}`,
                    background: h === hole ? G : allScored ? G + "22" : "transparent",
                    color: h === hole ? CREAM : allScored ? G : M,
                    fontSize: "10px", fontWeight: 700, cursor: "pointer",
                  }}>{h + 1}</button>
                );
              })}
            </div>
          </div>

          {/* Score entry for each player in group */}
          <div style={{ display: "grid", gap: "8px" }}>
            {groupPlayers.map((p) => {
              const chcp = playerCourseHcp(p, course);
              const strokes = strokesOnHole(chcp, si);
              const gross = (scores[p.id] || [])[hole] || 0;
              const net = gross ? netHole(gross, chcp, si) : null;
              const vsPar = net !== null ? net - par : null;

              return (
                <div key={p.id} style={{ background: CARD, border: `1px solid ${GOLD}22`, borderRadius: "10px", padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "14px", color: CREAM, fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: "11px", color: M }}>
                        HCP {chcp}{strokes > 0 ? ` · +${strokes} stroke${strokes > 1 ? "s" : ""}` : ""}
                      </div>
                    </div>

                    {/* Gross score input */}
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "10px", color: M, marginBottom: "3px" }}>GROSS</div>
                      <input
                        value={gross || ""}
                        onChange={(e) => setScore(p.id, hole, e.target.value)}
                        type="number"
                        min="1" max="15"
                        style={scoreInput}
                      />
                    </div>

                    {/* Net score display */}
                    <div style={{ textAlign: "center", minWidth: "44px" }}>
                      <div style={{ fontSize: "10px", color: M, marginBottom: "3px" }}>NET</div>
                      <div style={{
                        width: "40px", height: "40px", borderRadius: "8px", display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: "16px", fontWeight: 700,
                        background: net === null ? "transparent" : vsPar < 0 ? R + "22" : vsPar === 0 ? G + "22" : CARD2,
                        border: `1px solid ${net === null ? GOLD + "22" : vsPar < 0 ? R + "66" : vsPar === 0 ? G + "66" : GOLD + "33"}`,
                        color: net === null ? M : vsPar < 0 ? R : vsPar === 0 ? G : CREAM,
                      }}>
                        {net !== null ? net : "—"}
                      </div>
                      {vsPar !== null && (
                        <div style={{ fontSize: "10px", color: vsPar < 0 ? R : vsPar === 0 ? G : M, marginTop: "2px" }}>
                          {vsPar === 0 ? "E" : vsPar > 0 ? `+${vsPar}` : vsPar}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
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

const navBtn = {
  padding: "7px 14px", borderRadius: "7px",
  border: "1px solid rgba(201,168,76,0.25)",
  background: "transparent", color: "#f0ece0",
  fontFamily: "'Inter','Helvetica Neue',sans-serif",
  fontSize: "13px", cursor: "pointer",
};

const scoreInput = {
  width: "44px", height: "44px", textAlign: "center",
  borderRadius: "8px", border: "1px solid rgba(201,168,76,0.3)",
  background: "rgba(26,61,36,0.2)", color: "#f0ece0",
  fontSize: "18px", fontWeight: 700,
  fontFamily: "'Inter','Helvetica Neue',sans-serif", outline: "none",
};
