import { useState, useEffect, useRef } from "react";
import { CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { playerCourseHcp, strokesOnHole, netHole, totalPar } from "../lib/golfLogic";
import { savePlayerScore, saveRoundCourse } from "../firebase/client";

const LOST_BALL_SECS = 180;

// Module-level AudioContext — created on first user tap so iOS allows it later
let _audioCtx = null;

function unlockAudio() {
  try {
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === "suspended") _audioCtx.resume();
    const buf = _audioCtx.createBuffer(1, 1, 22050);
    const src = _audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(_audioCtx.destination);
    src.start(0);
  } catch(e) {}
}

function playHorn() {
  try {
    const ctx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    const honks = [
      { startFreq: 480, endFreq: 320, start: 0.0, dur: 0.25 },
      { startFreq: 420, endFreq: 280, start: 0.3, dur: 0.25 },
      { startFreq: 360, endFreq: 220, start: 0.6, dur: 0.35 },
    ];
    honks.forEach(({ startFreq, endFreq, start, dur }) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(startFreq, ctx.currentTime + start);
      osc.frequency.linearRampToValueAtTime(endFreq, ctx.currentTime + start + dur);
      env.gain.setValueAtTime(0, ctx.currentTime + start);
      env.gain.linearRampToValueAtTime(0.6, ctx.currentTime + start + 0.02);
      env.gain.setValueAtTime(0.6, ctx.currentTime + start + dur - 0.05);
      env.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
      osc.connect(env);
      env.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    });
  } catch(e) {}
}

function LostBallTimer() {
  const [running, setRunning] = useState(false);
  const [secsLeft, setSecsLeft] = useState(LOST_BALL_SECS);
  const [expired, setExpired] = useState(false);
  const intervalRef = useRef(null);

  function start() {
    unlockAudio();
    setSecsLeft(LOST_BALL_SECS);
    setExpired(false);
    setRunning(true);
  }

  function cancel() {
    setRunning(false);
    setExpired(false);
    setSecsLeft(LOST_BALL_SECS);
    clearInterval(intervalRef.current);
  }

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSecsLeft(s => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          setRunning(false);
          setExpired(true);
          playHorn();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;
  const timeStr = `${mins}:${String(secs).padStart(2, "0")}`;
  const urgent = secsLeft <= 30 && running;
  const pct = secsLeft / LOST_BALL_SECS;

  return (
    <>
      {!running && !expired && (
        <button onClick={start}
          title="Start 3-min lost ball timer"
          style={{
            position: "fixed", bottom: "20px", right: "18px", zIndex: 100,
            width: "52px", height: "52px", borderRadius: "50%",
            background: G + "18", border: `2px solid ${G}55`,
            color: G, fontSize: "22px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)", touchAction: "manipulation",
          }}>
          ⏱
        </button>
      )}

      {(running || expired) && (
        <div style={{
          position: "fixed", bottom: "0", left: "0", right: "0", zIndex: 100,
          background: expired ? R : urgent ? R + "ee" : "rgba(20,45,20,0.96)",
          borderTop: `3px solid ${expired ? R : urgent ? R : G}`,
          padding: "14px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px",
          boxShadow: "0 -4px 16px rgba(0,0,0,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1 }}>
            <span style={{ fontSize: "26px" }}>{expired ? "🚫" : "⏱"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", color: expired ? "#fff" : "#b8f0c8", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: "2px" }}>
                {expired ? "Time's Up — Lost Ball!" : "Lost Ball Timer"}
              </div>
              {!expired && (
                <>
                  <div style={{ fontFamily: FB, fontSize: "32px", fontWeight: 700, color: urgent ? "#fff" : "#b8f0c8", lineHeight: 1 }}>
                    {timeStr}
                  </div>
                  <div style={{ height: "3px", background: "rgba(255,255,255,0.15)", borderRadius: "2px", marginTop: "4px" }}>
                    <div style={{
                      height: "100%", borderRadius: "2px",
                      background: urgent ? "#fff" : "#b8f0c8",
                      width: `${pct * 100}%`,
                      transition: "width 1s linear",
                    }} />
                  </div>
                </>
              )}
              {expired && (
                <div style={{ fontSize: "14px", color: "#fff", fontWeight: 600 }}>
                  Drop and play a penalty stroke
                </div>
              )}
            </div>
          </div>
          <button onClick={cancel}
            style={{
              padding: "10px 20px", borderRadius: "9px", fontFamily: FB, fontSize: "14px",
              fontWeight: 700, cursor: "pointer", touchAction: "manipulation",
              border: "2px solid rgba(255,255,255,0.4)",
              background: "rgba(255,255,255,0.15)", color: "#fff",
            }}>
            {expired ? "Dismiss" : "Cancel"}
          </button>
        </div>
      )}
    </>
  );
}

export default function ScoringScreen({ event, saveEvent }) {
  const { players = [], courses = {}, rounds = {}, pairings = {} } = event;
  const [activeRound, setActiveRound] = useState(1);
  const [activeGroup, setActiveGroup] = useState(0);
  const [activeHole, setActiveHole] = useState(0); // 0-indexed

  const round = rounds[activeRound] || {};
  const course = courses[round.courseId || activeRound];
  const scores = round.scores || {};

  const groupsObj = pairings[activeRound] || {};
  const hasGroups = Object.keys(groupsObj).length > 0;
  const groups = hasGroups
    ? [groupsObj[0] || [], groupsObj[1] || [], groupsObj[2] || []]
    : [players.map((p) => p.id)];
  const groupPlayers = (groups[activeGroup] || [])
    .map((id) => players.find((p) => p.id === id))
    .filter(Boolean);

  async function setScore(pid, holeIdx, val) {
    const v = parseInt(val);
    const playerScores = [...(scores[pid] || Array(18).fill(0))];
    playerScores[holeIdx] = isNaN(v) || v < 0 ? 0 : v;

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
    saveEvent(updated, true);

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

  async function setRoundCourseHandler(cId) {
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

  // Hole navigation: two rows of 9
  const holeNav = (start, end) => (
    <div style={{ display: "flex", gap: "4px" }}>
      {Array.from({ length: end - start }, (_, i) => {
        const h = start + i;
        const isActive = h === activeHole;
        const hasScore = groupPlayers.some(p => (scores[p.id] || [])[h]);
        return (
          <button
            key={h}
            onClick={() => setActiveHole(h)}
            style={{
              flex: 1, padding: "7px 2px", borderRadius: "7px",
              fontFamily: FB, fontSize: "13px", fontWeight: isActive ? 700 : 500,
              cursor: "pointer", border: "none", touchAction: "manipulation",
              background: isActive ? G : hasScore ? G + "18" : CARD2,
              color: isActive ? "#fff" : hasScore ? G : M,
              boxShadow: isActive ? `0 0 0 2px ${G}44` : "none",
              transition: "background 0.15s",
            }}>
            {h + 1}
          </button>
        );
      })}
    </div>
  );

  const par = course?.par?.[activeHole] || 4;
  const si = course?.si?.[activeHole] || (activeHole + 1);

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "22px 14px", paddingBottom: "90px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        Scoring
      </div>

      {/* Round tabs */}
      <div className="round-tabs">
        {[1, 2, 3].map((r) => (
          <button key={r}
            onClick={() => { setActiveRound(r); setActiveHole(0); }}
            className={`round-tab${activeRound === r ? " active" : ""}`}>
            Round {r}
          </button>
        ))}
      </div>

      {/* Course selector */}
      {!round.courseId && (
        <div style={{ background: CARD, border: `1px solid ${GO}44`, borderRadius: "10px", padding: "12px 14px", marginBottom: "14px" }}>
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
          <div style={{ fontSize: "12px", color: M, marginBottom: "12px" }}>
            {course.name} · Par {totalPar(course)} · Slope {course.slope} · Rating {course.rating}
          </div>

          {/* Group selector */}
          {groups.length > 1 && (
            <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
              {groups.map((g, gi) => (
                <button key={gi}
                  onClick={() => { setActiveGroup(gi); setActiveHole(0); }}
                  className={`round-tab${activeGroup === gi ? " active" : ""}`}>
                  Group {gi + 1}
                </button>
              ))}
            </div>
          )}

          {/* Hole navigation */}
          <div style={{ background: CARD, border: `1px solid #d0d8d0`, borderRadius: "12px", padding: "10px 12px", marginBottom: "14px" }}>
            <div style={{ fontSize: "10px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: "6px" }}>
              OUT &nbsp;·&nbsp; Par {course.par.slice(0, 9).reduce((a, b) => a + b, 0)}
            </div>
            {holeNav(0, 9)}
            <div style={{ fontSize: "10px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, margin: "8px 0 6px" }}>
              IN &nbsp;·&nbsp; Par {course.par.slice(9).reduce((a, b) => a + b, 0)}
            </div>
            {holeNav(9, 18)}
            <div style={{ marginTop: "8px", fontSize: "11px", color: M, textAlign: "center" }}>
              Hole {activeHole + 1} &nbsp;·&nbsp; Par {par} &nbsp;·&nbsp; SI {si}
            </div>
          </div>

          {/* Player stepper cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: groupPlayers.length <= 2 ? "1fr 1fr" : "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "10px",
            marginBottom: "16px",
          }}>
            {groupPlayers.map((p) => {
              const chcp = playerCourseHcp(p, course);
              const strokes = strokesOnHole(chcp, si);
              const gross = (scores[p.id] || [])[activeHole] || 0;
              const net = gross ? netHole(gross, chcp, si) : null;
              const vsPar = net !== null ? net - par : null;

              const netColor = vsPar === null ? M : vsPar < 0 ? R : vsPar === 0 ? G : CREAM;

              return (
                <div key={p.id} style={{
                  background: CARD, border: `1px solid #d0d8d0`,
                  borderRadius: "12px", padding: "14px 12px",
                  display: "flex", flexDirection: "column", gap: "8px",
                }}>
                  {/* Player header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: CREAM }}>{p.name}</div>
                      <div style={{ fontSize: "11px", color: M, marginTop: "1px" }}>
                        HCP {chcp}{strokes > 0 ? ` · +${strokes} stroke${strokes > 1 ? "s" : ""}` : ""}
                      </div>
                    </div>
                    {/* Net score badge */}
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "10px", color: M, marginBottom: "2px" }}>NET</div>
                      <div style={{ fontSize: "22px", fontWeight: 700, color: netColor, lineHeight: 1 }}>
                        {net !== null ? net : "—"}
                      </div>
                      {vsPar !== null && (
                        <div style={{ fontSize: "10px", color: netColor, fontWeight: 600 }}>
                          {vsPar === 0 ? "E" : vsPar > 0 ? `+${vsPar}` : vsPar}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Gross stepper */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <div style={{ fontSize: "10px", color: M, letterSpacing: "0.06em", textTransform: "uppercase" }}>Gross</div>
                    <div className="stepper" style={{ flex: 1, maxWidth: "200px", overflow: !gross ? "visible" : "hidden" }}>
                      <button
                        onClick={() => stepScore(p.id, activeHole, -1)}
                        style={{ touchAction: "manipulation", borderRadius: !gross ? "8px 0 0 8px" : undefined }}>
                        −
                      </button>
                      <div
                        onClick={() => !gross && setScore(p.id, activeHole, par)}
                        style={{
                          flex: 1, height: "52px",
                          display: "flex", flexDirection: "column",
                          alignItems: "center", justifyContent: "center", gap: "3px",
                          cursor: !gross ? "pointer" : "default",
                          touchAction: "manipulation",
                          background: !gross ? `${G}15` : "transparent",
                          ...(gross ? {} : {
                            border: `2px dashed ${G}88`,
                            borderRadius: "4px",
                            margin: "0",
                            height: "52px",
                          }),
                        }}>
                        {!gross ? (
                          <>
                            <span style={{ fontSize: "13px", fontWeight: 700, color: G, lineHeight: 1 }}>PAR</span>
                            <span style={{ fontSize: "11px", color: G, opacity: 0.8, lineHeight: 1.4 }}>tap = {par}</span>
                          </>
                        ) : (
                          <span style={{ fontSize: "24px", fontWeight: 700, color: "#1a1f1a" }}>{gross}</span>
                        )}
                      </div>
                      <button
                        onClick={() => stepScore(p.id, activeHole, 1)}
                        style={{ touchAction: "manipulation", borderRadius: !gross ? "0 8px 8px 0" : undefined }}>
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Running totals strip */}
          {groupPlayers.length > 0 && (
            <div style={{
              background: CARD2, border: `1px solid #d0d8d0`, borderRadius: "10px",
              padding: "8px 14px", marginBottom: "16px",
              display: "flex", gap: "6px", overflowX: "auto",
            }}>
              {groupPlayers.map((p) => {
                const totals = playerTotals(p.id);
                const holesIn = totals.countTotal;
                const netVsPar = holesIn > 0
                  ? totals.netTotal - (holesIn <= 9
                      ? course.par.slice(0, 9).reduce((a, b) => a + b, 0)
                      : totalPar(course))
                  : null;
                const netColor = netVsPar === null ? M : netVsPar < 0 ? R : netVsPar === 0 ? G : CREAM;
                return (
                  <div key={p.id} style={{
                    flex: "1 0 auto", textAlign: "center",
                    borderRight: `1px solid #d0d8d0`, padding: "2px 10px",
                  }}>
                    <div style={{ fontSize: "11px", color: M, marginBottom: "2px", whiteSpace: "nowrap" }}>
                      {p.name.split(" ")[0]}
                    </div>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center", alignItems: "baseline" }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: holesIn > 0 ? CREAM : M }}>
                        {holesIn > 0 ? totals.grossTotal : "—"}
                      </span>
                      <span style={{ fontSize: "11px", color: M }}>G</span>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: holesIn > 0 ? netColor : M }}>
                        {holesIn > 0 ? totals.netTotal : "—"}
                      </span>
                      <span style={{ fontSize: "11px", color: M }}>N</span>
                    </div>
                    <div style={{ fontSize: "10px", color: M }}>
                      {holesIn > 0 ? `${holesIn} holes` : "no scores"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full scorecard grid */}
          <div className="card2">
            <div className="scorecard-wrap">
              <table className="scorecard">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", paddingLeft: "10px", position: "sticky", left: 0, background: CARD2, zIndex: 2 }}>Player</th>
                    {Array.from({ length: 9 }, (_, i) => (
                      <th key={i} style={{ background: i === activeHole ? G + "22" : undefined, color: i === activeHole ? G : undefined }}>
                        {i + 1}
                      </th>
                    ))}
                    <th className="nine-sep" style={{ color: GO }}>OUT</th>
                    {Array.from({ length: 9 }, (_, i) => (
                      <th key={i + 9} style={{ background: (i + 9) === activeHole ? G + "22" : undefined, color: (i + 9) === activeHole ? G : undefined }}>
                        {i + 10}
                      </th>
                    ))}
                    <th className="nine-sep" style={{ color: GO }}>IN</th>
                    <th style={{ color: GO }}>TOT</th>
                    <th style={{ color: G }}>NET</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="par-row">
                    <td style={{ textAlign: "left", paddingLeft: "10px", position: "sticky", left: 0, background: CARD2, zIndex: 1, color: GO, fontWeight: 600 }}>Par</td>
                    {course.par.slice(0, 9).map((p, i) => (
                      <td key={i} style={{ background: i === activeHole ? G + "18" : undefined }}>{p}</td>
                    ))}
                    <td className="nine-sep total-cell" style={{ color: GO }}>{course.par.slice(0, 9).reduce((a, b) => a + b, 0)}</td>
                    {course.par.slice(9).map((p, i) => (
                      <td key={i + 9} style={{ background: (i + 9) === activeHole ? G + "18" : undefined }}>{p}</td>
                    ))}
                    <td className="nine-sep total-cell" style={{ color: GO }}>{course.par.slice(9).reduce((a, b) => a + b, 0)}</td>
                    <td className="total-cell" style={{ color: GO }}>{totalPar(course)}</td>
                    <td></td>
                  </tr>

                  <tr className="si-row">
                    <td style={{ textAlign: "left", paddingLeft: "10px", fontSize: "10px", position: "sticky", left: 0, background: CARD2, zIndex: 1 }}>SI</td>
                    {course.si.slice(0, 9).map((s, i) => (
                      <td key={i} style={{ background: i === activeHole ? G + "18" : undefined }}>{s}</td>
                    ))}
                    <td className="nine-sep"></td>
                    {course.si.slice(9).map((s, i) => (
                      <td key={i + 9} style={{ background: (i + 9) === activeHole ? G + "18" : undefined }}>{s}</td>
                    ))}
                    <td className="nine-sep"></td>
                    <td></td>
                    <td></td>
                  </tr>

                  {groupPlayers.map((p) => {
                    const chcp = playerCourseHcp(p, course);
                    const ps = scores[p.id] || [];
                    const totals = playerTotals(p.id);
                    const netVsPar = totals.countTotal > 0
                      ? totals.netTotal - (totals.countB > 0 ? totalPar(course) : course.par.slice(0, 9).reduce((a, b) => a + b, 0))
                      : null;
                    const netColor = netVsPar === null ? M : netVsPar < 0 ? R : netVsPar === 0 ? G : CREAM;

                    return (
                      <tr key={p.id} style={{ borderBottom: "1px solid #d8ddd8" }}>
                        <td className="player-name">
                          {p.name}
                          <span style={{ fontSize: "10px", color: GO, marginLeft: "6px" }}>{chcp}</span>
                        </td>
                        {Array.from({ length: 9 }, (_, h) => {
                          const gross = ps[h] || 0;
                          const isActive = h === activeHole;
                          return (
                            <td key={h}
                              className={`hole-cell ${isActive ? "active" : ""} ${scoreClass(gross, course.par[h], chcp, course.si[h])}`}
                              onClick={() => setActiveHole(h)}>
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
                          const isActive = h === activeHole;
                          return (
                            <td key={h}
                              className={`hole-cell ${isActive ? "active" : ""} ${scoreClass(gross, course.par[h], chcp, course.si[h])}`}
                              onClick={() => setActiveHole(h)}>
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
                        <td className="total-cell" style={{ color: totals.countTotal > 0 ? netColor : M }}>
                          {totals.countTotal > 0 ? totals.netTotal : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(0,0,0,0.06)", fontSize: "11px", color: M }}>
              Tap a hole to navigate · Net = Gross − Course HCP (USGA)
            </div>
          </div>
        </>
      ) : (
        <div style={{ textAlign: "center", color: M, padding: "40px 0", fontSize: "14px" }}>
          Set up courses first, then assign a course to Round {activeRound}.
        </div>
      )}

      <LostBallTimer />
    </div>
  );
}
