import React, { useMemo, useRef } from "react";
import { G, GO, GOLD, M, R, CREAM, CARD2, FB, FD } from "../constants/theme";
import { playerCourseHcp } from "../lib/golfLogic";

// ── Scoring helpers ────────────────────────────────────────────────────────────
// Standard Stableford: net double bogey+ = 0, bogey 1, par 2, birdie 3, eagle 4…
function stabPts(gross, par, strokes) {
  if (!gross) return null;
  const net = gross - strokes;
  return Math.max(0, 2 - (net - par));
}
// Max gross that still scores a point (net double bogey).
function maxGross(par, strokes) {
  return par + 2 + strokes;
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

// Forced take/pass given prior decisions (in played order).
// Returns true=forcedTake, false=forcedPass, null=free choice.
function sixiesForced(decisions, k, nHoles, takesNeeded) {
  const passesAllowed = nHoles - takesNeeded;
  const takesUsed = decisions.slice(0, k).filter((x) => x === true).length;
  const passesUsed = decisions.slice(0, k).filter((x) => x === false).length;
  if (takesUsed >= takesNeeded) return false;
  if (passesUsed >= passesAllowed) return true;
  if ((nHoles - 1 - k) < (takesNeeded - takesUsed)) return true;
  return null;
}

const COLORS = [G, GO, "#4a7fc4", "#9b4db5"];

export default function SixiesScreen({ event, saveEvent }) {
  const players = event.players || [];
  const courses = event.courses || {};
  const sx = event.sixies || {};
  const cellRefs = useRef({});

  // ── Config (persisted in event.sixies) ──────────────────────────────────────
  const courseKeys = Object.keys(courses);
  const mode = sx.mode === "18" ? "18" : "9";
  const courseId = sx.courseId != null && courses[sx.courseId] ? sx.courseId : (courseKeys[0] ?? null);
  const nine = sx.nine === "back" ? "back" : "front";
  const playerIds = Array.isArray(sx.playerIds) ? sx.playerIds : [];
  const scores = sx.scores || {};
  const takes = sx.takes || {};
  const course = courseId != null ? courses[courseId] : null;

  const persist = (partial) => {
    const next = { mode, courseId, nine, playerIds, scores, takes, ...partial };
    saveEvent({ ...event, sixies: next }, { sixies: next });
  };

  // Holes played (absolute indices 0..17)
  const holeIdx = useMemo(() => {
    if (!course) return [];
    if (mode === "18") return course.par.map((_, i) => i);
    return nine === "back" ? [9, 10, 11, 12, 13, 14, 15, 16, 17] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
  }, [course, mode, nine]);

  const nHoles = holeIdx.length;
  const takesNeeded = Math.round((nHoles * 2) / 3); // 9→6, 18→12
  const siList = useMemo(() => holeIdx.map((h) => course?.si?.[h] ?? 0), [holeIdx, course]);
  const totalPar = useMemo(() => holeIdx.reduce((s, h) => s + (course?.par?.[h] || 0), 0), [holeIdx, course]);

  const selPlayers = playerIds.map((id) => players.find((p) => p.id === id)).filter(Boolean);

  // Strokes per player: { playerId: { absHoleIdx: strokes } }
  const strokesByPlayer = useMemo(() => {
    const out = {};
    for (const p of selPlayers) {
      if (!course) { out[p.id] = {}; continue; }
      const chFull = playerCourseHcp(p, course);
      const ch = mode === "18" ? chFull : Math.round(chFull / 2);
      const alloc = allocateStrokes(ch, siList);
      const m = {};
      holeIdx.forEach((h, k) => { m[h] = alloc[k]; });
      out[p.id] = m;
    }
    return out;
  }, [selPlayers, course, mode, siList, holeIdx]);

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
  const clearScores = () => persist({ scores: {}, takes: {} });

  // ── Per-player scoring ───────────────────────────────────────────────────────
  const strokesOn = (pid, h) => strokesByPlayer[pid]?.[h] || 0;
  const grossOn = (pid, h) => scores[pid]?.[h] || 0;
  const ptsOn = (pid, h) => {
    const g = grossOn(pid, h);
    if (!g) return null;
    return stabPts(g, course.par[h], strokesOn(pid, h));
  };
  const stabTotal = (pid) => holeIdx.reduce((s, h) => s + (ptsOn(pid, h) || 0), 0);
  const grossTotal = (pid) => holeIdx.reduce((s, h) => s + grossOn(pid, h), 0);

  // Sixies decisions in played order → effective take per played hole
  const decisionsOf = (pid) => holeIdx.map((h) => {
    const v = takes[pid]?.[h];
    return v === true || v === false ? v : null;
  });
  const effectiveTakes = (pid) => {
    const dec = decisionsOf(pid);
    return dec.map((chosen, k) => (chosen !== null ? chosen : sixiesForced(dec, k, nHoles, takesNeeded)));
  };
  const sixiesTotal = (pid) => {
    const eff = effectiveTakes(pid);
    return holeIdx.reduce((s, h, k) => {
      if (eff[k] !== true) return s;
      const g = grossOn(pid, h);
      if (!g) return s;
      return s + (g - strokesOn(pid, h));
    }, 0);
  };
  const sixiesTaken = (pid) => effectiveTakes(pid).filter((x) => x === true).length;
  const sixiesPassed = (pid) => decisionsOf(pid).filter((x) => x === false).length;

  const anyScores = selPlayers.some((p) => holeIdx.some((h) => grossOn(p.id, h) > 0));

  const stabResults = selPlayers
    .map((p, i) => ({ id: p.id, name: p.name, stab: stabTotal(p.id), color: COLORS[playerIds.indexOf(p.id)] }))
    .sort((a, b) => b.stab - a.stab);
  const sixiesResults = selPlayers
    .map((p) => ({ id: p.id, name: p.name, total: sixiesTotal(p.id), taken: sixiesTaken(p.id), color: COLORS[playerIds.indexOf(p.id)] }))
    .sort((a, b) => a.total - b.total); // lower net is better

  // ── Keyboard nav across played holes / players ──────────────────────────────
  const handleKey = (e, pRow, k) => {
    const last = selPlayers.length - 1;
    const focus = (r, c) => cellRefs.current[`${selPlayers[r]?.id}-${holeIdx[c]}`]?.focus();
    if ((e.key === "Tab" && !e.shiftKey) || e.key === "Enter" || e.key === "ArrowRight") {
      e.preventDefault();
      if (k < nHoles - 1) focus(pRow, k + 1); else if (pRow < last) focus(pRow + 1, 0);
    } else if ((e.key === "Tab" && e.shiftKey) || e.key === "ArrowLeft") {
      e.preventDefault();
      if (k > 0) focus(pRow, k - 1); else if (pRow > 0) focus(pRow - 1, nHoles - 1);
    } else if (e.key === "ArrowDown") { e.preventDefault(); focus(Math.min(last, pRow + 1), k); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focus(Math.max(0, pRow - 1), k); }
  };

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

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "16px 12px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontFamily: FD, fontSize: "26px", fontWeight: 600, color: CREAM }}>⬡ Sixies</div>
        {anyScores && (
          <button onClick={clearScores}
            style={{ padding: "8px 14px", borderRadius: "8px", border: `1px solid ${R}44`, background: R + "12", color: R, fontFamily: FB, fontSize: "13px", cursor: "pointer" }}>
            Clear scores
          </button>
        )}
      </div>

      {/* Config panel */}
      <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", padding: "12px 14px", marginBottom: "14px", display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-end" }}>
        <div>
          <div style={labelStyle}>Course</div>
          <select value={courseId ?? ""} onChange={(e) => persist({ courseId: e.target.value })} style={selectStyle}>
            {courseKeys.map((k) => <option key={k} value={k}>{courses[k]?.name || `Course ${k}`}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Holes</div>
          <div style={{ display: "flex", gap: "4px" }}>
            <Seg active={mode === "9"} onClick={() => persist({ mode: "9" })}>9</Seg>
            <Seg active={mode === "18"} onClick={() => persist({ mode: "18" })}>18</Seg>
          </div>
        </div>
        {mode === "9" && (
          <div>
            <div style={labelStyle}>Nine</div>
            <div style={{ display: "flex", gap: "4px" }}>
              <Seg active={nine === "front"} onClick={() => persist({ nine: "front" })}>Front</Seg>
              <Seg active={nine === "back"} onClick={() => persist({ nine: "back" })}>Back</Seg>
            </div>
          </div>
        )}
        <div style={{ marginLeft: "auto", fontSize: "12px", color: M }}>
          Take <strong style={{ color: GOLD }}>{takesNeeded}</strong> of {nHoles} · Par {totalPar}
        </div>
      </div>

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
          {/* Sixies status bars */}
          <div style={{ marginBottom: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {selPlayers.map((p) => {
              const ci = playerIds.indexOf(p.id);
              const taken = sixiesTaken(p.id);
              const passesLeft = (nHoles - takesNeeded) - sixiesPassed(p.id);
              const eff = effectiveTakes(p.id);
              const dec = decisionsOf(p.id);
              return (
                <div key={p.id} style={{ background: CARD2, border: `1px solid ${GOLD}33`, borderRadius: "10px", padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: COLORS[ci] }} />
                    <span style={{ fontSize: "13px", fontWeight: 600, color: CREAM }}>{p.name}</span>
                    <span style={{ marginLeft: "auto", fontSize: "13px", color: GOLD, fontWeight: 700 }}>{taken}/{takesNeeded} taken</span>
                    <span style={{ fontSize: "12px", color: passesLeft === 0 ? R : M }}>{passesLeft} pass{passesLeft !== 1 ? "es" : ""} left</span>
                  </div>
                  <div style={{ display: "flex", gap: "3px" }}>
                    {holeIdx.map((h, k) => {
                      const e = eff[k];
                      const isForced = dec[k] === null && sixiesForced(dec, k, nHoles, takesNeeded) !== null;
                      let bg, label, col;
                      if (e === true) { bg = G + "33"; label = "T"; col = G; }
                      else if (e === false) { bg = GOLD + "33"; label = "P"; col = "#b87800"; }
                      else { bg = "#e0e0e0"; label = String(h + 1); col = "#999"; }
                      return (
                        <div key={h} style={{ flex: 1, height: "26px", borderRadius: "5px", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, color: col, border: isForced ? `1px dashed ${e === true ? G : GOLD}` : "none", opacity: e === null ? 0.6 : 1 }}>
                          {label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scorecard */}
          <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "14px", overflow: "hidden", marginBottom: "14px" }}>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: `${140 + nHoles * 46}px` }}>
                <thead>
                  <tr style={{ background: "rgba(26,61,36,0.07)", borderBottom: `1px solid ${GOLD}33` }}>
                    <td style={{ padding: "7px 10px", fontWeight: 700, color: M, fontSize: "12px", whiteSpace: "nowrap" }}>Player</td>
                    {holeIdx.map((h) => <td key={h} style={{ padding: "7px 3px", textAlign: "center", fontWeight: 600, color: M, fontSize: "12px", minWidth: "44px" }}>{h + 1}</td>)}
                    <td style={{ padding: "7px 8px", textAlign: "center", fontWeight: 700, color: CREAM, fontSize: "12px" }}>Stab · 6s</td>
                  </tr>
                  <tr style={{ background: "rgba(26,61,36,0.03)", fontSize: "11px", color: M }}>
                    <td style={{ padding: "3px 10px", fontWeight: 600 }}>Par</td>
                    {holeIdx.map((h) => <td key={h} style={{ padding: "3px 3px", textAlign: "center" }}>{course.par[h]}</td>)}
                    <td style={{ padding: "3px 8px", textAlign: "center", fontWeight: 700 }}>{totalPar}</td>
                  </tr>
                  <tr style={{ borderBottom: `2px solid ${GOLD}33`, fontSize: "11px", color: M }}>
                    <td style={{ padding: "3px 10px", fontWeight: 600 }}>SI</td>
                    {holeIdx.map((h) => <td key={h} style={{ padding: "3px 3px", textAlign: "center" }}>{course.si[h]}</td>)}
                    <td />
                  </tr>
                </thead>
                <tbody>
                  {selPlayers.map((p, pRow) => {
                    const ci = playerIds.indexOf(p.id);
                    const eff = effectiveTakes(p.id);
                    const dec = decisionsOf(p.id);
                    return (
                      <tr key={p.id} style={{ borderBottom: pRow < selPlayers.length - 1 ? `1px solid ${GOLD}18` : "none" }}>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: COLORS[ci] }} />
                            <span style={{ fontSize: "13px", fontWeight: 600, color: CREAM }}>{p.name}</span>
                          </div>
                        </td>
                        {holeIdx.map((h, k) => {
                          const gross = grossOn(p.id, h);
                          const strokes = strokesOn(p.id, h);
                          const pts = ptsOn(p.id, h);
                          const cap = maxGross(course.par[h], strokes);
                          const ptColor = pts === null ? M : pts >= 3 ? G : pts === 1 ? GOLD : pts === 0 ? M : R;
                          const bg = gross ? (pts >= 3 ? "#e6f5ea" : pts === 1 ? "#fdf6e0" : pts === 0 ? "#fff" : R + "14") : "#fff";
                          const bd = gross ? (pts >= 3 ? G : pts === 1 ? GOLD : pts === 0 ? "#aaa" : R) : "#ccc";
                          const chosen = dec[k];
                          const isForced = chosen === null && sixiesForced(dec, k, nHoles, takesNeeded) !== null;
                          const e = eff[k];
                          return (
                            <td key={h} style={{ padding: "4px 2px", textAlign: "center", verticalAlign: "top" }}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", paddingTop: "2px" }}>
                                {strokes > 0 && <span style={{ fontSize: "8px", color: G, fontWeight: 700, lineHeight: 1 }}>{"•".repeat(strokes)}</span>}
                                <input
                                  ref={(el) => (cellRefs.current[`${p.id}-${h}`] = el)}
                                  type="number" min="1" max={cap} value={gross || ""} placeholder={String(course.par[h])} inputMode="numeric"
                                  onChange={(e2) => { const v = parseInt(e2.target.value); setScore(p.id, h, isNaN(v) || v < 1 ? 0 : Math.min(cap, v)); }}
                                  onKeyDown={(e2) => handleKey(e2, pRow, k)}
                                  onFocus={(e2) => e2.target.select()}
                                  style={{ width: "42px", height: "42px", textAlign: "center", background: bg, border: `2px solid ${bd}`, borderRadius: "8px", color: gross ? ptColor : "#aaa", fontFamily: FB, fontSize: "16px", fontWeight: 700, outline: "none", MozAppearance: "textfield", appearance: "textfield", opacity: e === false ? 0.35 : 1, touchAction: "manipulation" }}
                                />
                                {gross > 0 && <span style={{ fontSize: "11px", color: M, lineHeight: 1 }}>{gross - strokes}</span>}
                                {isForced ? (
                                  <span style={{ fontSize: "9px", fontWeight: 800, color: e === true ? G : "#b87800", opacity: 0.6, lineHeight: 1, marginTop: "1px" }}>{e === true ? "TAKE" : "PASS"}</span>
                                ) : (
                                  <div style={{ display: "flex", gap: "2px", marginTop: "1px" }}>
                                    <button onPointerDown={(e2) => { e2.preventDefault(); setTake(p.id, h, chosen === true ? null : true); }}
                                      style={{ width: "20px", height: "20px", padding: 0, fontSize: "9px", fontWeight: 800, borderRadius: "4px", cursor: "pointer", lineHeight: 1, border: `1.5px solid ${chosen === true ? G : "#ccc"}`, background: chosen === true ? G + "22" : "transparent", color: chosen === true ? G : "#bbb" }}>T</button>
                                    <button onPointerDown={(e2) => { e2.preventDefault(); setTake(p.id, h, chosen === false ? null : false); }}
                                      style={{ width: "20px", height: "20px", padding: 0, fontSize: "9px", fontWeight: 800, borderRadius: "4px", cursor: "pointer", lineHeight: 1, border: `1.5px solid ${chosen === false ? "#e6a817" : "#ccc"}`, background: chosen === false ? "#e6a81722" : "transparent", color: chosen === false ? "#e6a817" : "#bbb" }}>P</button>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                          <div style={{ fontSize: "18px", fontWeight: 700, color: G, lineHeight: 1.1 }}>{stabTotal(p.id) || "—"}</div>
                          <div style={{ fontSize: "16px", fontWeight: 700, color: GOLD, marginTop: "3px", padding: "2px 6px", background: GOLD + "18", borderRadius: "6px", display: "inline-block" }}>
                            {sixiesTaken(p.id) > 0 ? sixiesTotal(p.id) : "—"}<span style={{ fontSize: "9px", fontWeight: 400, color: M, marginLeft: "2px" }}>6s</span>
                          </div>
                          {grossTotal(p.id) > 0 && <div style={{ fontSize: "11px", color: M, marginTop: "2px" }}>{grossTotal(p.id)} gross</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Leaderboards */}
          {anyScores && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
              <Board title="Stableford" accent={G} rows={stabResults.map((r) => ({ ...r, value: r.stab, sub: null }))} highColor={G} />
              <Board title="⬡ Sixies (net)" accent={GOLD} rows={sixiesResults.map((r) => ({ ...r, value: r.taken > 0 ? r.total : "—", sub: `${r.taken}/${takesNeeded}` }))} highColor={GOLD} winnerFirst />
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

function Seg({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{ padding: "7px 12px", borderRadius: "7px", fontFamily: FB, fontSize: "13px", cursor: "pointer", fontWeight: active ? 700 : 400, border: active ? `2px solid ${GOLD}` : `1px solid ${GOLD}33`, background: active ? GOLD + "1f" : "transparent", color: active ? CREAM : M }}>
      {children}
    </button>
  );
}

function Board({ title, accent, rows, highColor, winnerFirst }) {
  return (
    <div style={{ background: CARD2, border: `1px solid ${accent}44`, borderRadius: "14px", padding: "14px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: accent, marginBottom: "8px", fontWeight: 700 }}>{title}</div>
      {rows.map((r, rank) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 0", borderBottom: rank < rows.length - 1 ? `1px solid ${GOLD}18` : "none" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: rank === 0 ? accent : M, minWidth: "18px", textAlign: "center" }}>{rank + 1}</span>
          <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: r.color }} />
          <span style={{ flex: 1, fontSize: "15px", fontWeight: 600, color: CREAM }}>{r.name}</span>
          {r.sub && <span style={{ fontSize: "12px", color: M }}>{r.sub}</span>}
          <span style={{ fontSize: "22px", fontWeight: 700, color: rank === 0 ? highColor : CREAM, minWidth: "34px", textAlign: "right" }}>{r.value}</span>
        </div>
      ))}
      {winnerFirst && <div style={{ fontSize: "10px", color: M, marginTop: "6px" }}>Lowest net wins</div>}
    </div>
  );
}
