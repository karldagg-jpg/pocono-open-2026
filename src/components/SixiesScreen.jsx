import { useState, useMemo } from "react";
import { G, GO, GOLD, M, R, CREAM, CARD, CARD2, FB, FD } from "../constants/theme";
import { playerCourseHcp } from "../lib/golfLogic";

// ── Scoring helpers ────────────────────────────────────────────────────────────
// Standard Stableford: net double bogey+ = 0, bogey 1, par 2, birdie 3, eagle 4…
function stabPts(gross, par, strokes) {
  if (!gross) return null;
  const net = gross - strokes;
  return Math.max(0, 2 - (net - par));
}
// Distribute a course handicap across the played holes, hardest SI first.
function allocateStrokes(courseHcp, siList) {
  const n = siList.length;
  const strokes = Array(n).fill(0);
  const h = Math.round(courseHcp || 0);
  if (h <= 0 || n === 0) return strokes;
  const order = siList.map((si, i) => ({ si, i })).sort((a, b) => a.si - b.si);
  for (let k = 0; k < h; k++) strokes[order[k % n].i] += 1;
  return strokes;
}

// Sixies: take 6 of 9 holes. Decisions are made in played order and can't be
// undone once you've moved on. Forced take/pass given prior decisions:
//   true = forced take, false = forced pass, null = free choice.
// Pass all 3 allowed passes → the rest are forced takes. Take all 6 → forced pass.
const N_HOLES = 9;
const TAKES_NEEDED = 6;
const PASSES_ALLOWED = N_HOLES - TAKES_NEEDED; // 3

// Forcing is based only on decisions actually made — never on hole position.
// (A position rule would pre-mark the tail of the round as "forced take" before
// you've played a hole, which is wrong: nothing is decided until you decide it.)
function sixiesForced(decisions, k) {
  const takesUsed = decisions.slice(0, k).filter((x) => x === true).length;
  const passesUsed = decisions.slice(0, k).filter((x) => x === false).length;
  if (takesUsed >= TAKES_NEEDED) return false;   // already taken 6 → rest pass
  if (passesUsed >= PASSES_ALLOWED) return true; // already passed 3 → rest take
  return null;
}

const COLORS = [G, GO, "#3f7cc0", "#9b4db5"];
const NINES = {
  front: { label: "Front 9", holes: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
  back:  { label: "Back 9",  holes: [9, 10, 11, 12, 13, 14, 15, 16, 17] },
};

export default function SixiesScreen({ event, saveEvent, library }) {
  const players = event.players || [];
  const courses = { ...(event.courses || {}), ...library };
  const sx = event.sixies || {};

  // ── Config (persisted in event.sixies) ──────────────────────────────────────
  const courseKeys = Object.keys(courses);
  const courseId = sx.courseId != null && courses[sx.courseId] ? sx.courseId : (courseKeys[0] ?? null);
  const game = sx.game === "back" ? "back" : "front";
  const playerIds = Array.isArray(sx.playerIds) ? sx.playerIds : [];
  const scores = sx.scores || {};
  const takes = sx.takes || {};
  const stakes = sx.stakes || { amount: "", unit: "game", note: "" };
  const course = courseId != null ? courses[courseId] : null;

  const holeIdx = NINES[game].holes;
  const [activeK, setActiveK] = useState(0); // position 0..8 within the current nine

  const persist = (partial) => {
    const next = { courseId, game, playerIds, scores, takes, stakes, ...partial };
    saveEvent({ ...event, sixies: next }, { sixies: next });
  };

  const siList = useMemo(() => holeIdx.map((h) => course?.si?.[h] ?? 0), [holeIdx, course]);
  const totalPar = useMemo(() => holeIdx.reduce((s, h) => s + (course?.par?.[h] || 0), 0), [holeIdx, course]);
  const selPlayers = playerIds.map((id) => players.find((p) => p.id === id)).filter(Boolean);

  // Strokes per player for this nine: { playerId: { absHoleIdx: strokes } }
  const strokesByPlayer = useMemo(() => {
    const out = {};
    for (const p of selPlayers) {
      if (!course) { out[p.id] = {}; continue; }
      const ch = Math.round(playerCourseHcp(p, course) / 2); // half of 18-hole hcp for a nine
      const alloc = allocateStrokes(ch, siList);
      const m = {};
      holeIdx.forEach((h, k) => { m[h] = alloc[k]; });
      out[p.id] = m;
    }
    return out;
  }, [selPlayers, course, siList, holeIdx]);

  // ── Setters ─────────────────────────────────────────────────────────────────
  const togglePlayer = (id) => {
    if (playerIds.includes(id)) persist({ playerIds: playerIds.filter((x) => x !== id) });
    else if (playerIds.length < 4) persist({ playerIds: [...playerIds, id] });
  };
  const setScore = (pid, h, val) => {
    const ps = { ...(scores[pid] || {}), [h]: val };
    persist({ scores: { ...scores, [pid]: ps } });
  };
  const setTake = (pid, h, val) => {
    const pt = { ...(takes[pid] || {}) };
    if (val === null) delete pt[h]; else pt[h] = val;
    persist({ takes: { ...takes, [pid]: pt } });
  };
  const setStakes = (partial) => persist({ stakes: { ...stakes, ...partial } });
  const clearScores = () => {
    if (!window.confirm(`Clear all scores and take/pass picks for the ${NINES[game].label}?`)) return;
    const nextScores = { ...scores }, nextTakes = { ...takes };
    for (const p of selPlayers) {
      if (nextScores[p.id]) { nextScores[p.id] = { ...nextScores[p.id] }; holeIdx.forEach((h) => delete nextScores[p.id][h]); }
      if (nextTakes[p.id]) { nextTakes[p.id] = { ...nextTakes[p.id] }; holeIdx.forEach((h) => delete nextTakes[p.id][h]); }
    }
    persist({ scores: nextScores, takes: nextTakes });
  };

  // ── Per-player scoring ───────────────────────────────────────────────────────
  const strokesOn = (pid, h) => strokesByPlayer[pid]?.[h] || 0;
  const grossOn = (pid, h) => scores[pid]?.[h] || 0;
  const netOn = (pid, h) => grossOn(pid, h) - strokesOn(pid, h);
  const ptsOn = (pid, h) => {
    const g = grossOn(pid, h);
    if (!g) return null;
    return stabPts(g, course.par[h], strokesOn(pid, h));
  };
  const stabTotal = (pid) => holeIdx.reduce((s, h) => s + (ptsOn(pid, h) || 0), 0);

  // Sixies decisions in played order → effective take per played hole
  const decisionsOf = (pid) => holeIdx.map((h) => {
    const v = takes[pid]?.[h];
    return v === true || v === false ? v : null;
  });
  const effectiveTakes = (pid) => {
    const dec = decisionsOf(pid);
    return dec.map((chosen, k) => (chosen !== null ? chosen : sixiesForced(dec, k)));
  };
  // A hole counts as "taken" only once it's taken AND has a score entered —
  // that's what feeds the net total and the X/6 count.
  const isBanked = (pid, k) => effectiveTakes(pid)[k] === true && grossOn(pid, holeIdx[k]) > 0;
  const sixiesTotal = (pid) => holeIdx.reduce((s, h, k) => (isBanked(pid, k) ? s + (grossOn(pid, h) - strokesOn(pid, h)) : s), 0);
  const sixiesTaken = (pid) => holeIdx.reduce((n, h, k) => (isBanked(pid, k) ? n + 1 : n), 0);
  const sixiesPassed = (pid) => decisionsOf(pid).filter((x) => x === false).length;
  const sixiesComplete = (pid) => sixiesTaken(pid) === TAKES_NEEDED;

  const anyScores = selPlayers.some((p) => holeIdx.some((h) => grossOn(p.id, h) > 0));

  // Standings: finished rounds first (lowest net wins the clubhouse), then
  // in-progress players by how far along they are, then by net so far.
  const standings = selPlayers
    .map((p) => ({
      id: p.id, name: p.name, color: COLORS[playerIds.indexOf(p.id)],
      total: sixiesTotal(p.id), taken: sixiesTaken(p.id), complete: sixiesComplete(p.id),
      stab: stabTotal(p.id),
    }))
    .sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? -1 : 1;
      if (a.complete) return a.total - b.total;
      if (b.taken !== a.taken) return b.taken - a.taken;
      return a.total - b.total;
    });
  const leaderId = anyScores && standings.length && standings[0].taken > 0 ? standings[0].id : null;

  // ── Winnings (winner-takes-all pot, settled per nine) ────────────────────────
  const ante = Number(stakes.amount) || 0;
  const pot = ante * selPlayers.length;
  const allComplete = selPlayers.length >= 2 && selPlayers.every((p) => sixiesComplete(p.id));
  const settlement = (() => {
    if (!ante || selPlayers.length < 2 || !allComplete) return null;
    const nets = selPlayers.map((p) => ({
      id: p.id, name: p.name, color: COLORS[playerIds.indexOf(p.id)], net: sixiesTotal(p.id),
    }));
    const min = Math.min(...nets.map((n) => n.net));
    const winners = nets.filter((n) => n.net === min);
    const share = pot / winners.length;
    return nets
      .map((n) => ({ ...n, isWinner: n.net === min, win: n.net === min ? share - ante : -ante }))
      .sort((a, b) => b.win - a.win);
  })();

  // ── Empty states ────────────────────────────────────────────────────────────
  if (players.length === 0 || courseKeys.length === 0) {
    return (
      <div style={{ maxWidth: "700px", margin: "0 auto", padding: "40px 16px", textAlign: "center", color: M }}>
        <div style={{ fontFamily: FD, fontSize: "24px", color: CREAM, marginBottom: "10px" }}>⬡ Sixies</div>
        <div style={{ fontSize: "14px" }}>
          Add {players.length === 0 ? "players" : "a course"} first
          {" "}(under {players.length === 0 ? "Players" : "Courses"}) to set up a Sixies game.
        </div>
      </div>
    );
  }

  const absHole = holeIdx[activeK];

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "16px 12px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <div style={{ fontFamily: FD, fontSize: "26px", fontWeight: 600, color: CREAM }}>⬡ Sixies</div>
          <div style={{ fontSize: "12px", color: M }}>Take {TAKES_NEEDED} of {N_HOLES} · lowest net on your taken holes wins</div>
        </div>
        {anyScores && (
          <button onClick={clearScores}
            style={{ padding: "8px 14px", borderRadius: "8px", border: `1px solid ${R}44`, background: R + "12", color: R, fontFamily: FB, fontSize: "13px", cursor: "pointer" }}>
            Clear {NINES[game].label}
          </button>
        )}
      </div>

      {/* Config: course + which nine (each nine is its own game) */}
      <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", padding: "12px 14px", marginBottom: "12px", display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-end" }}>
        <div>
          <div style={labelStyle}>Course</div>
          <select value={courseId ?? ""} onChange={(e) => persist({ courseId: e.target.value })} style={selectStyle}>
            {courseKeys.map((k) => <option key={k} value={k}>{courses[k]?.name || `Course ${k}`}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Game</div>
          <div style={{ display: "flex", gap: "4px" }}>
            <Seg active={game === "front"} onClick={() => { persist({ game: "front" }); setActiveK(0); }}>Front 9</Seg>
            <Seg active={game === "back"} onClick={() => { persist({ game: "back" }); setActiveK(0); }}>Back 9</Seg>
          </div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: "12px", color: M, textAlign: "right" }}>
          <div>{NINES[game].label} · Par <strong style={{ color: CREAM }}>{totalPar}</strong></div>
          <div style={{ fontSize: "11px" }}>The other nine is a separate game</div>
        </div>
      </div>

      {/* Playing for — stakes banner */}
      <StakesBanner stakes={stakes} setStakes={setStakes} nPlayers={selPlayers.length} />

      {/* Player picker */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ ...labelStyle, marginBottom: "6px" }}>Players ({playerIds.length}/4)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {players.map((p) => {
            const on = playerIds.includes(p.id);
            const ci = playerIds.indexOf(p.id);
            const disabled = !on && playerIds.length >= 4;
            return (
              <button key={p.id} onClick={() => togglePlayer(p.id)} disabled={disabled}
                style={{
                  padding: "7px 11px", borderRadius: "20px", fontFamily: FB, fontSize: "13px",
                  cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1,
                  border: on ? `2px solid ${COLORS[ci]}` : `1px solid ${GOLD}33`,
                  background: on ? COLORS[ci] + "1f" : "transparent",
                  color: on ? CREAM : M, fontWeight: on ? 700 : 400,
                }}>
                {on && <span style={{ marginRight: "5px", color: COLORS[ci] }}>●</span>}
                {p.name} <span style={{ color: M, fontWeight: 400 }}>· {p.hcpIndex}</span>
              </button>
            );
          })}
        </div>
      </div>

      {selPlayers.length < 2 ? (
        <div style={{ textAlign: "center", color: M, padding: "30px 0", fontSize: "14px" }}>
          Select at least 2 players to start scoring.
        </div>
      ) : (
        <>
          {/* Hole navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <NavArrow disabled={activeK === 0} onClick={() => setActiveK((k) => Math.max(0, k - 1))}>‹</NavArrow>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontFamily: FD, fontSize: "22px", fontWeight: 700, color: CREAM, lineHeight: 1.1 }}>Hole {absHole + 1}</div>
              <div style={{ fontSize: "12px", color: M }}>Par {course.par[absHole]} · SI {course.si[absHole]}</div>
            </div>
            <NavArrow disabled={activeK === N_HOLES - 1} onClick={() => setActiveK((k) => Math.min(N_HOLES - 1, k + 1))}>›</NavArrow>
          </div>

          {/* Hole chips (jump + at-a-glance) */}
          <div style={{ display: "flex", gap: "4px", marginBottom: "12px" }}>
            {holeIdx.map((h, k) => {
              const someScored = selPlayers.some((p) => grossOn(p.id, h) > 0);
              const isActive = k === activeK;
              return (
                <button key={h} onClick={() => setActiveK(k)}
                  style={{
                    flex: 1, height: "30px", borderRadius: "6px", fontFamily: FB, fontSize: "12px", fontWeight: 700,
                    cursor: "pointer", lineHeight: 1,
                    border: isActive ? `2px solid ${G}` : `1px solid ${GOLD}33`,
                    background: isActive ? G + "1f" : someScored ? "rgba(26,107,58,0.08)" : CARD,
                    color: isActive ? G : someScored ? CREAM : M,
                  }}>
                  {h + 1}
                </button>
              );
            })}
          </div>

          {/* Active hole entry card */}
          <div style={{ background: CARD, border: `1px solid ${GOLD}33`, borderRadius: "14px", overflow: "hidden", marginBottom: "14px" }}>
            {selPlayers.map((p, pRow) => {
              const ci = playerIds.indexOf(p.id);
              const dec = decisionsOf(p.id);
              const chosen = dec[activeK];
              const forced = sixiesForced(dec, activeK);
              const eff = chosen !== null ? chosen : forced;
              const strokes = strokesOn(p.id, absHole);
              const gross = grossOn(p.id, absHole);
              const pts = ptsOn(p.id, absHole);
              const ptColor = pts === null ? M : pts >= 3 ? G : pts === 1 ? GOLD : pts === 0 ? M : R;
              const adj = (delta) => {
                const cur = gross || course.par[absHole];
                const next = Math.max(1, cur + delta);
                setScore(p.id, absHole, next);
              };
              return (
                <div key={p.id} style={{
                  padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
                  borderBottom: pRow < selPlayers.length - 1 ? `1px solid ${GOLD}18` : "none",
                  background: eff === false ? "rgba(0,0,0,0.02)" : "transparent",
                }}>
                  {/* Player + strokes */}
                  <div style={{ minWidth: "104px", flex: "0 0 auto" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: COLORS[ci] }} />
                      <span style={{ fontSize: "15px", fontWeight: 700, color: CREAM }}>{p.name}</span>
                    </div>
                    <div style={{ fontSize: "11px", color: M, marginTop: "2px", paddingLeft: "15px" }}>
                      {strokes > 0 ? <span style={{ color: G, fontWeight: 700 }}>{"•".repeat(strokes)} +{strokes} stroke{strokes > 1 ? "s" : ""}</span> : "no stroke"}
                    </div>
                  </div>

                  {/* Stepper */}
                  <div style={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}>
                    <button onClick={() => adj(-1)} style={stepBtn("left")}>−</button>
                    <div onClick={() => !gross && setScore(p.id, absHole, course.par[absHole])}
                      style={{
                        width: "58px", height: "54px", display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: "1px",
                        border: gross ? `1px solid ${GOLD}44` : `2px dashed ${G}99`,
                        background: gross ? "rgba(26,61,36,0.05)" : G + "14",
                        cursor: gross ? "default" : "pointer",
                      }}>
                      <span style={{ fontSize: gross ? "22px" : "12px", fontWeight: 700, color: gross ? ptColor : G, lineHeight: 1 }}>
                        {gross || "PAR"}
                      </span>
                      <span style={{ fontSize: "9px", color: gross ? M : G, lineHeight: 1 }}>
                        {gross ? `net ${gross - strokes}` : `tap = ${course.par[absHole]}`}
                      </span>
                    </div>
                    <button onClick={() => adj(+1)} style={stepBtn("right")}>+</button>
                  </div>

                  {/* Take / Pass */}
                  <div style={{ flex: "1 1 auto", display: "flex", justifyContent: "flex-end", minWidth: "132px" }}>
                    {forced !== null ? (
                      <div style={{
                        padding: "9px 14px", borderRadius: "9px", fontSize: "13px", fontWeight: 800, letterSpacing: "0.03em",
                        border: `1.5px solid ${forced ? G : GOLD}`, background: (forced ? G : GOLD) + "18", color: forced ? G : "#8a6600",
                        display: "flex", alignItems: "center", gap: "5px",
                      }}>
                        🔒 {forced ? "TAKE" : "PASS"} <span style={{ fontSize: "10px", fontWeight: 600, color: M }}>forced</span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button onClick={() => setTake(p.id, absHole, chosen === true ? null : true)} style={tpBtn(chosen === true, G)}>TAKE</button>
                        <button onClick={() => setTake(p.id, absHole, chosen === false ? null : false)} style={tpBtn(chosen === false, GOLD)}>PASS</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Per-player progress toward 6 of 9 */}
          <div style={{ marginBottom: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {selPlayers.map((p) => {
              const ci = playerIds.indexOf(p.id);
              const taken = sixiesTaken(p.id);
              const passesLeft = PASSES_ALLOWED - sixiesPassed(p.id);
              const eff = effectiveTakes(p.id);
              const dec = decisionsOf(p.id);
              return (
                <div key={p.id} style={{ background: CARD2, border: `1px solid ${GOLD}33`, borderRadius: "10px", padding: "9px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "7px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: COLORS[ci] }} />
                    <span style={{ fontSize: "13px", fontWeight: 600, color: CREAM }}>{p.name}</span>
                    <span style={{ marginLeft: "auto", fontSize: "13px", color: GOLD, fontWeight: 700 }}>{taken}/{TAKES_NEEDED} taken</span>
                    <span style={{ fontSize: "12px", color: passesLeft === 0 ? R : M }}>{passesLeft} pass{passesLeft !== 1 ? "es" : ""} left</span>
                  </div>
                  <div style={{ display: "flex", gap: "3px" }}>
                    {holeIdx.map((h, k) => {
                      const e = eff[k];
                      const isForced = dec[k] === null && sixiesForced(dec, k) !== null;
                      let bg, label, col;
                      if (e === true) { bg = G + "26"; label = "T"; col = G; }
                      else if (e === false) { bg = GOLD + "26"; label = "P"; col = "#8a6600"; }
                      else { bg = "#e2e4df"; label = String(h + 1); col = M; }
                      return (
                        <button key={h} onClick={() => setActiveK(k)}
                          style={{
                            flex: 1, height: "24px", borderRadius: "5px", background: bg, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "10px", fontWeight: 700, color: col,
                            border: k === activeK ? `2px solid ${CREAM}55` : isForced ? `1px dashed ${e === true ? G : GOLD}` : "1px solid transparent",
                            opacity: e === null ? 0.7 : 1,
                          }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Read-only overview scorecard */}
          <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "14px", overflow: "hidden", marginBottom: "14px" }}>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: `${120 + N_HOLES * 40}px` }}>
                <thead>
                  <tr style={{ background: "rgba(26,61,36,0.07)", borderBottom: `1px solid ${GOLD}33` }}>
                    <td style={{ padding: "6px 10px", fontWeight: 700, color: M, fontSize: "12px", whiteSpace: "nowrap" }}>Hole</td>
                    {holeIdx.map((h, k) => (
                      <td key={h} onClick={() => setActiveK(k)} style={{ padding: "6px 3px", textAlign: "center", fontWeight: 700, color: k === activeK ? G : M, fontSize: "12px", minWidth: "36px", cursor: "pointer" }}>{h + 1}</td>
                    ))}
                    <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: GOLD, fontSize: "11px" }}>6s net</td>
                  </tr>
                  <tr style={{ background: "rgba(26,61,36,0.03)", fontSize: "11px", color: M, borderBottom: `2px solid ${GOLD}33` }}>
                    <td style={{ padding: "3px 10px", fontWeight: 600 }}>Par</td>
                    {holeIdx.map((h) => <td key={h} style={{ padding: "3px 3px", textAlign: "center" }}>{course.par[h]}</td>)}
                    <td />
                  </tr>
                </thead>
                <tbody>
                  {selPlayers.map((p, pRow) => {
                    const ci = playerIds.indexOf(p.id);
                    const eff = effectiveTakes(p.id);
                    return (
                      <tr key={p.id} style={{ borderBottom: pRow < selPlayers.length - 1 ? `1px solid ${GOLD}18` : "none" }}>
                        <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: COLORS[ci], display: "inline-block", marginRight: "5px" }} />
                          <span style={{ fontSize: "13px", fontWeight: 600, color: CREAM }}>{p.name}</span>
                        </td>
                        {holeIdx.map((h, k) => {
                          const gross = grossOn(p.id, h);
                          const taken = eff[k] === true;
                          const passed = eff[k] === false;
                          return (
                            <td key={h} onClick={() => setActiveK(k)} style={{
                              padding: "6px 3px", textAlign: "center", cursor: "pointer",
                              background: taken ? G + "12" : passed ? "rgba(0,0,0,0.02)" : "transparent",
                            }}>
                              <div style={{ fontSize: "14px", fontWeight: 700, color: gross ? (taken ? CREAM : M) : "#c4c8c0", opacity: passed ? 0.5 : 1 }}>
                                {gross || "·"}
                              </div>
                              {gross > 0 && <div style={{ fontSize: "9px", color: taken ? G : M, opacity: passed ? 0.5 : 1 }}>{netOn(p.id, h)}</div>}
                            </td>
                          );
                        })}
                        <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 800, color: GOLD, fontSize: "16px", whiteSpace: "nowrap" }}>
                          {sixiesTaken(p.id) > 0 ? sixiesTotal(p.id) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Standings */}
          {anyScores && (
            <div style={{ background: CARD2, border: `1px solid ${GOLD}44`, borderRadius: "14px", padding: "14px" }}>
              <div style={{ fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: GOLD, marginBottom: "8px", fontWeight: 700 }}>
                ⬡ {NINES[game].label} Standings <span style={{ color: M, fontWeight: 400 }}>· lowest net wins</span>
              </div>
              {standings.map((r, rank) => {
                const isLeader = rank === 0 && r.id === leaderId;
                return (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 0", borderBottom: rank < standings.length - 1 ? `1px solid ${GOLD}18` : "none" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: isLeader ? GOLD : M, minWidth: "18px", textAlign: "center" }}>{rank + 1}</span>
                    <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: r.color }} />
                    <span style={{ flex: 1, fontSize: "15px", fontWeight: 600, color: CREAM }}>
                      {r.name}
                      {isLeader && <span style={{ marginLeft: "8px", fontSize: "11px", fontWeight: 700, color: GOLD }}>◆ {r.complete ? "clubhouse leader" : "leading"}</span>}
                    </span>
                    <span style={{ fontSize: "12px", color: r.complete ? G : M, fontWeight: r.complete ? 700 : 400 }}>{r.taken}/{TAKES_NEEDED}{r.complete ? " ✓" : ""}</span>
                    <span style={{ fontSize: "22px", fontWeight: 700, color: isLeader ? GOLD : CREAM, minWidth: "40px", textAlign: "right" }}>
                      {r.taken > 0 ? r.total : "—"}
                    </span>
                  </div>
                );
              })}
              <div style={{ fontSize: "11px", color: M, marginTop: "8px" }}>
                Net = gross − strokes on your {TAKES_NEEDED} taken holes. Stableford (info): {standings.map((r) => `${r.name} ${r.stab}`).join(" · ")}
              </div>
            </div>
          )}

          {/* Winnings — winner-takes-all pot for this nine */}
          {ante > 0 && anyScores && selPlayers.length >= 2 && (
            <div style={{ background: G + "0d", border: `1px solid ${G}44`, borderRadius: "14px", padding: "14px", marginTop: "12px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: G, fontWeight: 700 }}>💰 Winnings</span>
                <span style={{ fontSize: "12px", color: M }}>${ante} each · <strong style={{ color: CREAM }}>${pot} pot</strong> · winner takes all</span>
              </div>
              {allComplete && settlement ? (
                <>
                  {settlement.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: `1px solid ${G}18` }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: s.color }} />
                      <span style={{ flex: 1, fontSize: "15px", fontWeight: 600, color: CREAM }}>
                        {s.name}{s.isWinner && <span style={{ marginLeft: "8px", fontSize: "11px", fontWeight: 700, color: G }}>◆ takes the pot</span>}
                      </span>
                      <span style={{ fontSize: "18px", fontWeight: 800, color: s.win > 0 ? G : s.win < 0 ? R : M, minWidth: "56px", textAlign: "right" }}>
                        {s.win > 0 ? `+$${s.win % 1 === 0 ? s.win : s.win.toFixed(2)}` : s.win < 0 ? `−$${Math.abs(s.win)}` : "$0"}
                      </span>
                    </div>
                  ))}
                  {settlement.filter((s) => s.isWinner).length > 1 && (
                    <div style={{ fontSize: "11px", color: M, marginTop: "8px" }}>Tie for low net — pot split evenly.</div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: "13px", color: M }}>
                  Not final — {selPlayers.filter((p) => !sixiesComplete(p.id)).length} still out.
                  {leaderId && <> If it ended now, <strong style={{ color: G }}>{standings[0].name}</strong> takes the ${pot} pot.</>}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Small presentational helpers ───────────────────────────────────────────────
const labelStyle = { fontSize: "11px", color: M, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "4px" };
const selectStyle = { background: "#fff", border: `1px solid ${GOLD}44`, borderRadius: "7px", color: CREAM, fontFamily: FB, fontSize: "14px", padding: "7px 9px", cursor: "pointer", outline: "none" };
const stepBtn = (side) => ({
  width: "40px", height: "54px", border: `1px solid ${GOLD}44`,
  borderRadius: side === "left" ? "9px 0 0 9px" : "0 9px 9px 0",
  [side === "left" ? "borderRight" : "borderLeft"]: "none",
  background: "rgba(26,61,36,0.06)", color: CREAM, fontSize: "22px", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none", touchAction: "manipulation",
});
const tpBtn = (active, color) => ({
  padding: "9px 16px", borderRadius: "9px", fontFamily: FB, fontSize: "13px", fontWeight: 800, letterSpacing: "0.03em", cursor: "pointer",
  border: `1.5px solid ${active ? color : "#c9ccc6"}`,
  background: active ? color + "22" : "transparent",
  color: active ? (color === GOLD ? "#8a6600" : color) : "#9aa09a",
});

function Seg({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{ padding: "7px 12px", borderRadius: "7px", fontFamily: FB, fontSize: "13px", cursor: "pointer", fontWeight: active ? 700 : 400, border: active ? `2px solid ${GOLD}` : `1px solid ${GOLD}33`, background: active ? GOLD + "1f" : "transparent", color: active ? CREAM : M }}>
      {children}
    </button>
  );
}

function NavArrow({ disabled, onClick, children }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        width: "44px", height: "44px", borderRadius: "10px", border: `1px solid ${GOLD}33`,
        background: disabled ? "transparent" : CARD, color: CREAM, fontSize: "24px", lineHeight: 1,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.3 : 1, flexShrink: 0,
      }}>
      {children}
    </button>
  );
}

function StakesBanner({ stakes, setStakes, nPlayers }) {
  const [open, setOpen] = useState(false);
  const amount = stakes.amount;
  const has = amount !== "" && amount != null && Number(amount) > 0;
  const pot = (Number(amount) || 0) * nPlayers;
  return (
    <div style={{ background: GOLD + "12", border: `1px solid ${GOLD}55`, borderRadius: "12px", padding: "11px 14px", marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD, fontWeight: 700 }}>Playing for</span>
        <span style={{ fontSize: "17px", fontWeight: 800, color: CREAM }}>
          {has ? `$${amount} each` : "—"}
        </span>
        {has && nPlayers >= 2 && <span style={{ fontSize: "13px", color: M }}>· ${pot} pot · winner takes all</span>}
        {stakes.note && <span style={{ fontSize: "13px", color: M }}>· {stakes.note}</span>}
        <button onClick={() => setOpen((o) => !o)}
          style={{ marginLeft: "auto", padding: "5px 11px", borderRadius: "7px", border: `1px solid ${GOLD}44`, background: "transparent", color: GOLD, fontFamily: FB, fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
          {open ? "Done" : has ? "Edit" : "Set stakes"}
        </button>
      </div>
      {open && (
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end", marginTop: "10px" }}>
          <div>
            <div style={labelStyle}>Buy-in per player ($)</div>
            <input type="number" min="0" inputMode="decimal" value={amount}
              onChange={(e) => setStakes({ amount: e.target.value })} placeholder="e.g. 5"
              style={{ width: "110px", padding: "8px 10px", borderRadius: "7px", border: `1px solid ${GOLD}44`, background: "#fff", color: CREAM, fontFamily: FB, fontSize: "14px", outline: "none" }} />
          </div>
          <div style={{ flex: 1, minWidth: "140px" }}>
            <div style={labelStyle}>Note (optional)</div>
            <input value={stakes.note} onChange={(e) => setStakes({ note: e.target.value })} placeholder="e.g. junk on birdies, auto-press…"
              style={{ width: "100%", padding: "8px 10px", borderRadius: "7px", border: `1px solid ${GOLD}44`, background: "#fff", color: CREAM, fontFamily: FB, fontSize: "14px", outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>
      )}
    </div>
  );
}
