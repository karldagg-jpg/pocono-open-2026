import { useState, useEffect, useRef } from "react";
import { CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { getEffectiveHcp, strokesOnHole, netHole, totalPar, gamblingPlayers } from "../lib/golfLogic";
import { groupList } from "../lib/pairings";
import { holeState, scattWorth, birdiePoolHole } from "../lib/holeMoney";
import { savePlayerScore, saveRoundCourse } from "../firebase/client";

const LOST_BALL_SECS = 180;

// What you'd call the score out loud. Gross against par, so a stroke doesn't
// turn a par into a birdie — the net figure sits beside it for that.
function scoreName(gross, par) {
  if (gross === 1) return "ACE";
  const d = gross - par;
  if (d <= -3) return "Albatross";
  if (d === -2) return "Eagle";
  if (d === -1) return "Birdie";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  if (d === 2) return "Double";
  return `+${d}`;
}

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

export default function ScoringScreen({ event, saveEvent, library }) {
  const { players = [], courses: eventCourses = {}, rounds = {}, pairings = {}, games = {} } = event;
  const courses = { ...eventCourses, ...library };
  const [activeRound, setActiveRound] = useState(1);
  const [activeGroup, setActiveGroup] = useState(0);
  const [activeHole, setActiveHole] = useState(0); // 0-indexed
  const [ctpFt, setCtpFt] = useState("");
  const [ctpIn, setCtpIn] = useState("");
  const [showCtpLog, setShowCtpLog] = useState(false);
  // On-course mode: the full scorecard is for the clubhouse. Walking down the
  // fairway you want this hole and nothing else. Remembered per phone, because
  // whoever keeps the card wants it on every time they pick the phone up.
  const [onCourse, setOnCourse] = useState(() => {
    try { return localStorage.getItem("pocono:onCourse") === "1"; } catch { return false; }
  });
  function toggleOnCourse() {
    setOnCourse((v) => {
      try { localStorage.setItem("pocono:onCourse", v ? "0" : "1"); } catch {}
      return !v;
    });
  }

  const round = rounds[activeRound] || {};
  const course = courses[round.courseId || activeRound];
  const scores = round.scores || {};

  const groupsObj = pairings[activeRound] || {};
  const hasGroups = Object.keys(groupsObj).length > 0;
  // However many groups the round actually has — reading 0,1,2 by hand silently
  // dropped the fourth group once the field grew past twelve.
  const groups = hasGroups ? groupList(pairings, activeRound) : [players.map((p) => p.id)];
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

  // CTP helpers
  const ctpHoles = games?.ctp?.holes?.[activeRound] || [];
  const isCTPHole = ctpHoles.includes(activeHole);
  const ctpWinnerId = games?.ctp?.results?.[activeRound]?.[activeHole] ?? null;
  const ctpWinner = ctpWinnerId != null ? players.find(p => p.id === ctpWinnerId) : null;
  const ctpSavedDist = games?.ctp?.distances?.[activeRound]?.[activeHole] ?? "";

  useEffect(() => {
    const m = ctpSavedDist.match(/^(\d+)'(\d+)"$/);
    if (m) { setCtpFt(m[1]); setCtpIn(m[2]); }
    else { setCtpFt(""); setCtpIn(""); }
  }, [activeHole, activeRound]);

  function ctpDistStr() {
    if (!ctpFt && !ctpIn) return "";
    return `${ctpFt || 0}'${String(ctpIn || 0).padStart(2, "0")}"`;
  }

  const ctpLog = games?.ctp?.log?.[activeRound]?.[activeHole] || [];

  function saveCTP(winnerId, distance) {
    const ctp = games?.ctp || {};
    const player = players.find(p => p.id === winnerId);
    const logEntry = { name: player?.name || "?", distance, ts: Date.now() };
    const newCtp = {
      ...ctp,
      results: {
        ...(ctp.results || {}),
        [activeRound]: { ...(ctp.results?.[activeRound] || {}), [activeHole]: winnerId },
      },
      distances: {
        ...(ctp.distances || {}),
        [activeRound]: { ...(ctp.distances?.[activeRound] || {}), [activeHole]: distance },
      },
      log: {
        ...(ctp.log || {}),
        [activeRound]: {
          ...(ctp.log?.[activeRound] || {}),
          [activeHole]: [...(ctp.log?.[activeRound]?.[activeHole] || []), logEntry],
        },
      },
    };
    const newGames = { ...games, ctp: newCtp };
    saveEvent({ ...event, games: newGames }, { games: newGames });
  }

  function clearCTP() {
    const ctp = games?.ctp || {};
    const results = { ...(ctp.results || {}), [activeRound]: { ...(ctp.results?.[activeRound] || {}) } };
    const distances = { ...(ctp.distances || {}), [activeRound]: { ...(ctp.distances?.[activeRound] || {}) } };
    const log = { ...(ctp.log || {}), [activeRound]: { ...(ctp.log?.[activeRound] || {}) } };
    delete results[activeRound][activeHole];
    delete distances[activeRound][activeHole];
    delete log[activeRound][activeHole];
    const newGames = { ...games, ctp: { ...ctp, results, distances, log } };
    saveEvent({ ...event, games: newGames }, { games: newGames });
    setCtpFt(""); setCtpIn(""); setShowCtpLog(false);
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

  const useIndex = games?.useIndexHcp !== false;

  function playerTotals(pid) {
    const ps = scores[pid] || [];
    const chcp = getEffectiveHcp(players.find((p) => p.id === pid), course, useIndex);
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
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
        <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM }}>
          Scoring
        </div>
        <button onClick={toggleOnCourse}
          style={{
            marginLeft: "auto", padding: "6px 12px", borderRadius: "999px", cursor: "pointer",
            fontFamily: FB, fontSize: "12px", fontWeight: 600, touchAction: "manipulation",
            border: `1px solid ${onCourse ? G : "#c8d0c8"}`,
            background: onCourse ? G : "transparent",
            color: onCourse ? "#fff" : M,
          }}>
          {onCourse ? "● On course" : "On course"}
        </button>
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
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {Object.entries(courses).map(([cId, c]) => (
              <button key={cId} onClick={() => setRoundCourseHandler(cId)} className="btn" style={{ padding: "7px 14px" }}>
                {c.name || `Course ${cId}`}
              </button>
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

          {/* CTP card — only on configured par-3 CTP holes */}
          {isCTPHole && (
            <div style={{ background: CARD, border: `2px solid ${GOLD}66`, borderRadius: "14px", padding: "14px", marginBottom: "16px" }}>
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "16px", marginRight: "8px" }}>🎯</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: CREAM }}>CTP — Hole {activeHole + 1}</div>
                  {ctpWinner
                    ? <div style={{ fontSize: "12px", color: G, fontWeight: 600 }}>{ctpWinner.name}{ctpSavedDist ? ` · ${ctpSavedDist}` : ""}</div>
                    : <div style={{ fontSize: "11px", color: M }}>Enter distance then tap player</div>
                  }
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  {ctpLog.length > 0 && (
                    <button onClick={() => setShowCtpLog(v => !v)} style={{ padding: "4px 10px", borderRadius: "6px", border: `1px solid #c8d0c8`, background: "transparent", color: M, fontSize: "11px", cursor: "pointer" }}>
                      Log ({ctpLog.length}) {showCtpLog ? "▲" : "▼"}
                    </button>
                  )}
                  {(ctpWinnerId != null || ctpLog.length > 0) && (
                    <button onClick={clearCTP} style={{ padding: "4px 10px", borderRadius: "6px", border: `1px solid ${R}44`, background: "transparent", color: R, fontSize: "11px", cursor: "pointer" }}>
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Feet + inches inputs */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", color: M }}>Dist</span>
                <input
                  type="number" min="0" max="99" value={ctpFt}
                  onChange={e => setCtpFt(e.target.value)}
                  placeholder="0"
                  style={{ width: "60px", padding: "7px 8px", borderRadius: "8px", border: "1px solid #c8d0c8", background: "#fff", color: CREAM, fontSize: "15px", fontWeight: 700, outline: "none", textAlign: "center" }}
                />
                <span style={{ fontSize: "12px", color: M }}>ft</span>
                <input
                  type="number" min="0" max="11" value={ctpIn}
                  onChange={e => setCtpIn(e.target.value)}
                  placeholder="0"
                  style={{ width: "60px", padding: "7px 8px", borderRadius: "8px", border: "1px solid #c8d0c8", background: "#fff", color: CREAM, fontSize: "15px", fontWeight: 700, outline: "none", textAlign: "center" }}
                />
                <span style={{ fontSize: "12px", color: M }}>in</span>
              </div>

              {/* Player grid — entire field, grey out non-leaders once set */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "6px" }}>
                {players.map(p => {
                  const isLeader = p.id === ctpWinnerId;
                  const dimmed = ctpWinnerId != null && !isLeader;
                  return (
                    <button
                      key={p.id}
                      onClick={() => saveCTP(p.id, ctpDistStr())}
                      style={{
                        padding: "10px 8px",
                        borderRadius: "9px",
                        border: `2px solid ${isLeader ? G : "#c8d0c8"}`,
                        background: isLeader ? G + "18" : "#fff",
                        color: isLeader ? G : dimmed ? "#aab0aa" : CREAM,
                        fontSize: "13px",
                        fontWeight: isLeader ? 700 : 500,
                        cursor: "pointer",
                        textAlign: "center",
                        touchAction: "manipulation",
                        opacity: dimmed ? 0.5 : 1,
                        transition: "opacity 0.2s",
                      }}>
                      {isLeader ? `✓ ${p.name.split(" ")[0]}` : p.name.split(" ")[0]}
                    </button>
                  );
                })}
              </div>

              {/* Collapsible measurement log */}
              {showCtpLog && ctpLog.length > 0 && (
                <div style={{ marginTop: "12px", borderTop: "1px solid #e8ede8", paddingTop: "10px" }}>
                  {ctpLog.map((entry, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "3px 0", borderBottom: "1px solid #f0f4f0" }}>
                      <span style={{ color: entry.name === ctpWinner?.name ? G : CREAM, fontWeight: entry.name === ctpWinner?.name ? 700 : 400 }}>
                        {entry.name === ctpWinner?.name ? "✓ " : ""}{entry.name}
                      </span>
                      <span style={{ color: M }}>{entry.distance || "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── What's on this hole ──
              The scorecard says what happened. This says what's at stake right
              now: who's leading the hole, whether it's heading for a push, and
              what a scat is currently worth. */}
          {onCourse && course && (() => {
            const hs = holeState(groupPlayers, course, scores, activeHole, useIndex);
            const bp = birdiePoolHole(groupPlayers, course, scores, activeHole);
            const scattPot = games?.scatts?.potByRound?.[activeRound]
              ?? (games?.scatts?.pot ? games.scatts.pot / 3 : 0);
            const worth = scattPot
              ? scattWorth(scores, course, gamblingPlayers(event), scattPot, useIndex)
              : null;

            const lead = hs.leaders.length === 1 ? hs.leaders[0] : null;
            const first = (r) => r.player.name.split(" ")[0];
            // "Leads" and "wins it" are different claims, and so are "heading
            // for a push" and "pushed" — the difference is whether every card
            // is in, which is exactly what someone standing on the green needs.
            const headline = lead
              ? `${first(lead)} ${hs.settled ? "wins it" : "leads"}`
              : hs.posted === 0 ? "Nobody in yet"
              : hs.leaders.length > 1
                ? `${hs.settled ? "Pushed" : "Tied"} — ${hs.leaders.map(first).join(" & ")}`
                : hs.settled ? "Pushed — nobody wins it" : "Heading for a push";
            const tone = lead && hs.settled ? G : lead ? GO : M;

            return (
              <div style={{ background: CARD, border: `1px solid ${tone}55`, borderRadius: "12px", padding: "12px 14px", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", letterSpacing: ".08em", textTransform: "uppercase", color: M, fontWeight: 600 }}>
                    Hole {hs.hole} · Par {hs.par} · SI {hs.si}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: "15px", fontWeight: 700, color: tone }}>{headline}</span>
                </div>

                {worth && (
                  <div style={{ fontSize: "12px", color: M, marginTop: "6px", lineHeight: 1.5 }}>
                    {worth.scatts > 0
                      ? <>Scats are worth <strong style={{ color: GO }}>${Math.round(worth.valueNow)}</strong> each
                          if the round ended now — {worth.scatts} won, {worth.pushes} pushed.
                          One more and they drop to ${Math.round(worth.valueIfOneMoreScatt)}.</>
                      : <>No scats won yet — all ${scattPot} is still out there.</>}
                  </div>
                )}

                {bp.events.length > 0 && (
                  <div style={{ fontSize: "12px", color: GO, marginTop: "5px" }}>
                    {bp.events.map((e, i) => (
                      <span key={i}>{i > 0 ? " · " : ""}{e.player.name.split(" ")[0]} {e.type} — collects ${e.collects}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Compact entry rows (on course) ──
              The card grid gives each player ~160px of height, so a foursome
              runs off the screen and you scroll to enter a score. These are one
              row each — the whole group and the hole strip fit in a glance,
              which is the layout PVGC settled on for the same reason. */}
          {onCourse && (
            <div style={{ marginBottom: "16px" }}>
              {groupPlayers.map((p) => {
                const chcp = getEffectiveHcp(p, course, useIndex);
                const strokes = strokesOnHole(chcp, si);
                const gross = (scores[p.id] || [])[activeHole] || 0;
                const net = gross ? netHole(gross, chcp, si) : null;
                const vsPar = net !== null ? net - par : null;
                const netColor = vsPar === null ? M : vsPar < 0 ? R : vsPar === 0 ? G : CREAM;

                return (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    background: CARD, border: "1px solid #d0d8d0", borderRadius: "10px",
                    padding: "6px 8px 6px 11px", marginBottom: "7px",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: CREAM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: "10.5px", color: strokes > 0 ? G : M, marginTop: "1px", fontWeight: strokes > 0 ? 700 : 400 }}>
                        {strokes > 0 ? `${"•".repeat(strokes)} ${strokes} stroke${strokes > 1 ? "s" : ""} here` : `plays off ${chcp} · no shot`}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                      <button onClick={() => stepScore(p.id, activeHole, -1)}
                        style={{
                          width: "40px", height: "46px", borderRadius: "9px 0 0 9px",
                          border: "1px solid #c8d0c8", borderRight: "none", background: "rgba(26,61,36,0.06)",
                          color: CREAM, fontSize: "21px", cursor: "pointer", touchAction: "manipulation",
                        }}>−</button>
                      <div onClick={() => !gross && setScore(p.id, activeHole, par)}
                        style={{
                          width: "50px", height: "46px",
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          border: gross ? "1px solid #c8d0c8" : `2px dashed ${G}88`,
                          background: gross ? "rgba(26,61,36,0.06)" : `${G}15`,
                          cursor: gross ? "default" : "pointer", touchAction: "manipulation",
                        }}>
                        <span style={{ fontSize: gross ? "20px" : "11px", fontWeight: 700, lineHeight: 1, color: gross ? CREAM : G }}>
                          {gross || "PAR"}
                        </span>
                        <span style={{ fontSize: "9px", lineHeight: 1, marginTop: "2px", color: gross ? M : G }}>
                          {gross ? scoreName(gross, par) : `tap = ${par}`}
                        </span>
                      </div>
                      <button onClick={() => stepScore(p.id, activeHole, +1)}
                        style={{
                          width: "40px", height: "46px", borderRadius: "0 9px 9px 0",
                          border: "1px solid #c8d0c8", borderLeft: "none", background: "rgba(26,61,36,0.06)",
                          color: CREAM, fontSize: "21px", cursor: "pointer", touchAction: "manipulation",
                        }}>+</button>
                    </div>

                    <div style={{ width: "36px", textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: "19px", fontWeight: 800, lineHeight: 1, color: gross ? netColor : M }}>
                        {gross ? net : "–"}
                      </div>
                      <div style={{ fontSize: "9px", color: M, marginTop: "2px" }}>net</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Player stepper cards — the roomier clubhouse layout */}
          {!onCourse && (
          <div style={{
            display: "grid",
            gridTemplateColumns: groupPlayers.length <= 2 ? "1fr 1fr" : "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "10px",
            marginBottom: "16px",
          }}>
            {groupPlayers.map((p) => {
              const chcp = getEffectiveHcp(p, course, useIndex);
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
                        {useIndex ? `Idx ${p.hcpIndex.toFixed(1)} → ${chcp}` : `HCP ${chcp}`}{strokes > 0 ? ` · +${strokes}` : ""}
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

                  {/* Gross achievement badge */}
                  {gross > 0 && (
                    gross === 1 ? (
                      <div style={{ textAlign: "center", fontSize: "12px", fontWeight: 700, color: GOLD, background: GOLD + "18", borderRadius: "6px", padding: "3px 0" }}>HOLE IN ONE</div>
                    ) : gross <= par - 2 ? (
                      <div style={{ textAlign: "center", fontSize: "12px", fontWeight: 700, color: GO, background: GO + "18", borderRadius: "6px", padding: "3px 0" }}>EAGLE</div>
                    ) : gross === par - 1 ? (
                      <div style={{ textAlign: "center", fontSize: "12px", fontWeight: 700, color: G, background: G + "18", borderRadius: "6px", padding: "3px 0" }}>BIRDIE</div>
                    ) : null
                  )}

                  {/* Gross stepper */}
                  <div>
                    <div style={{ fontSize: "10px", color: M, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "4px" }}>Gross</div>
                    <div className="stepper" style={{ width: "100%", overflow: !gross ? "visible" : "hidden" }}>
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
          )}

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

          {/* Full scorecard grid — the clubhouse view, hidden while on course */}
          {!onCourse && (
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
                    const chcp = getEffectiveHcp(p, course, useIndex);
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
                          const siVal = course.si?.[h] ?? (h + 1);
                          const strokes = strokesOnHole(chcp, siVal);
                          return (
                            <td key={h}
                              className={`hole-cell ${isActive ? "active" : ""} ${scoreClass(gross, course.par[h], chcp, siVal)}`}
                              onClick={() => setActiveHole(h)}>
                              {strokes > 0 && <div style={{ fontSize: "11px", color: "#28b45a", fontWeight: 700, lineHeight: 1, marginBottom: "1px" }}>{"•".repeat(strokes)}</div>}
                              {gross || "—"}
                              {gross === 1 && <div style={{ fontSize: "8px", color: GOLD, fontWeight: 700, lineHeight: 1 }}>HIO</div>}
                              {gross > 1 && course.par[h] && gross <= course.par[h] - 2 && <div style={{ fontSize: "8px", color: GO, fontWeight: 700, lineHeight: 1 }}>E</div>}
                              {gross > 0 && course.par[h] && gross === course.par[h] - 1 && <div style={{ fontSize: "8px", color: G, fontWeight: 700, lineHeight: 1 }}>B</div>}
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
                          const siVal = course.si?.[h] ?? (h + 1);
                          const strokes = strokesOnHole(chcp, siVal);
                          return (
                            <td key={h}
                              className={`hole-cell ${isActive ? "active" : ""} ${scoreClass(gross, course.par[h], chcp, siVal)}`}
                              onClick={() => setActiveHole(h)}>
                              {strokes > 0 && <div style={{ fontSize: "11px", color: "#28b45a", fontWeight: 700, lineHeight: 1, marginBottom: "1px" }}>{"•".repeat(strokes)}</div>}
                              {gross || "—"}
                              {gross === 1 && <div style={{ fontSize: "8px", color: GOLD, fontWeight: 700, lineHeight: 1 }}>HIO</div>}
                              {gross > 1 && course.par[h] && gross <= course.par[h] - 2 && <div style={{ fontSize: "8px", color: GO, fontWeight: 700, lineHeight: 1 }}>E</div>}
                              {gross > 0 && course.par[h] && gross === course.par[h] - 1 && <div style={{ fontSize: "8px", color: G, fontWeight: 700, lineHeight: 1 }}>B</div>}
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
              Tap a hole to navigate · Net = Gross − Index · • = stroke hole · B/E/HIO = gross achievement
            </div>
          </div>
          )}
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
