import { useState, useEffect, useRef } from "react";
import { CARD2, CREAM, G, GO, M, R, FD, FB } from "../constants/theme";
import { playerCourseHcp, strokesOnHole, netHole } from "../lib/golfLogic";

const PLAYER_COLORS = [
  "#1a6b3a", "#b8600a", "#2a72b8", "#8b2a8b",
  "#c0281c", "#2a8a7a", "#7a6010", "#1a5a8a",
  "#6a8a20", "#8a3a20", "#3a7a8a", "#7a3a8a",
];

function nvpBg(nvp) {
  if (nvp == null) return "transparent";
  if (nvp <= -2) return "#fce8e8";
  if (nvp === -1) return "#fff0f0";
  if (nvp === 0) return "#e8f5e8";
  return "transparent";
}

function nvpColor(nvp) {
  if (nvp == null) return M;
  if (nvp < 0) return R;
  if (nvp === 0) return G;
  if (nvp === 1) return CREAM;
  return M;
}

function RaceChart({ series, par }) {
  const [hoverHole, setHoverHole] = useState(null);
  const svgRef = useRef(null);

  const VW = 560, VH = 190;
  const pL = 30, pR = 14, pT = 12, pB = 24;
  const cW = VW - pL - pR, cH = VH - pT - pB;

  const allVals = series.flatMap(s => s.cum.filter(v => v != null));
  if (!allVals.length) return null;
  const rawMin = Math.min(...allVals, -3);
  const rawMax = Math.max(...allVals, 3);
  const yMin = Math.floor(rawMin / 3) * 3;
  const yMax = Math.ceil(rawMax / 3) * 3;
  const yRange = yMax - yMin || 6;

  const xOf = i => pL + (i / 18) * cW;
  // Lower net score = better = higher on screen = smaller SVG y
  const yOf = v => pT + cH - ((v - yMin) / yRange) * cH;

  const gridVals = [];
  for (let v = yMin; v <= yMax; v += 3) gridVals.push(v);

  const pickHole = (clientX) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const frac = ((clientX - rect.left) / rect.width * VW - pL) / cW * 18;
    setHoverHole(Math.round(Math.max(0, Math.min(18, frac))));
  };

  return (
    <div style={{ position: "relative" }}>
      <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: "100%", display: "block", cursor: "crosshair" }}
        onMouseMove={e => pickHole(e.clientX)}
        onMouseLeave={() => setHoverHole(null)}
        onTouchMove={e => { e.preventDefault(); pickHole(e.touches[0].clientX); }}
        onTouchEnd={() => setHoverHole(null)}>

        {gridVals.map(v => (
          <g key={v}>
            <line x1={pL} x2={VW - pR} y1={yOf(v)} y2={yOf(v)}
              stroke={v === 0 ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.05)"}
              strokeWidth={v === 0 ? 1.5 : 1}
              strokeDasharray={v !== 0 ? "3 3" : ""} />
            <text x={pL - 4} y={yOf(v) + 3.5} textAnchor="end" fontSize="8" fill="#8a9a8a">
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}

        <text x={xOf(0)} y={VH - 5} textAnchor="middle" fontSize="8" fill="#b0c0b0">S</text>
        {Array.from({ length: 18 }, (_, i) => (
          <text key={i} x={xOf(i + 1)} y={VH - 5} textAnchor="middle" fontSize="8"
            fill={hoverHole === i + 1 ? "#1a2e1a" : "#8a9a8a"}
            fontWeight={hoverHole === i + 1 ? "700" : "400"}>
            {i + 1}
          </text>
        ))}

        {/* Front/back 9 separator */}
        <line x1={xOf(9)} x2={xOf(9)} y1={pT} y2={VH - pB}
          stroke="rgba(0,0,0,0.1)" strokeWidth="1" strokeDasharray="4 2" />

        {series.map((s, si) => {
          const pts = s.cum.map((v, i) => v != null ? `${xOf(i)},${yOf(v)}` : null).filter(Boolean);
          if (pts.length < 2) return null;
          return (
            <g key={si}>
              <polyline points={pts.join(" ")} fill="none" stroke={s.color}
                strokeWidth={hoverHole != null ? 1.5 : 2}
                strokeLinejoin="round" strokeLinecap="round"
                opacity={hoverHole != null ? 0.45 : 0.9} />
              {s.cum.map((v, i) => {
                if (i === 0 || v == null) return null;
                const isHov = hoverHole === i;
                return (
                  <circle key={i} cx={xOf(i)} cy={yOf(v)} r={isHov ? 5 : 2.5}
                    fill={s.color} stroke={isHov ? "white" : "none"} strokeWidth={isHov ? 1.5 : 0}
                    style={{ transition: "r 0.1s" }} />
                );
              })}
            </g>
          );
        })}

        {hoverHole != null && hoverHole > 0 && (
          <line x1={xOf(hoverHole)} x2={xOf(hoverHole)} y1={pT} y2={VH - pB}
            stroke="rgba(0,0,0,0.18)" strokeWidth="1" strokeDasharray="3 2" />
        )}
      </svg>

      {hoverHole != null && hoverHole > 0 && (
        <div style={{
          position: "absolute", top: "6px",
          ...(hoverHole > 10 ? { left: "36px" } : { right: "18px" }),
          background: "rgba(255,255,255,0.97)",
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: "8px", padding: "7px 10px",
          fontSize: "11px", pointerEvents: "none",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)", zIndex: 10, minWidth: "170px",
        }}>
          <div style={{ fontWeight: 700, color: "#4a5a4a", marginBottom: "5px", fontSize: "12px" }}>
            Hole {hoverHole} · Par {par[hoverHole - 1]}
          </div>
          {[...series]
            .filter(s => s.cum[hoverHole] != null)
            .sort((a, b) => a.cum[hoverHole] - b.cum[hoverHole])
            .map((s, si, arr) => {
              const cumV = s.cum[hoverHole];
              const holeV = cumV - (s.cum[hoverHole - 1] ?? 0);
              return (
                <div key={si} style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: si < arr.length - 1 ? "3px" : 0 }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: s.color, flexShrink: 0 }} />
                  <span style={{ color: "#1a2e1a", flex: 1, fontSize: "11px" }}>{s.name.split(" ")[0]}</span>
                  <span style={{ fontWeight: 700, color: cumV < 0 ? R : cumV === 0 ? G : CREAM, minWidth: "28px", textAlign: "right" }}>
                    {cumV > 0 ? `+${cumV}` : cumV === 0 ? "E" : cumV}
                  </span>
                  <span style={{ color: holeV < 0 ? R : holeV === 0 ? G : M, fontSize: "10px", minWidth: "22px", textAlign: "right" }}>
                    {holeV > 0 ? `+${holeV}` : holeV === 0 ? "E" : holeV}
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

export default function ReplayScreen({ event }) {
  const { players = [], courses = {}, rounds = {} } = event;

  const [activeRound, setActiveRound] = useState(() => {
    for (let r = 3; r >= 1; r--) {
      if (rounds[r] && Object.keys(rounds[r].scores || {}).length > 0) return r;
    }
    return 1;
  });
  const [playHole, setPlayHole] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    setPlayHole(0); setPlaying(false); clearTimeout(timerRef.current);
  }, [activeRound]);

  useEffect(() => {
    if (!playing) return;
    if (playHole >= maxHole) { setPlaying(false); return; }
    timerRef.current = setTimeout(() => setPlayHole(h => h + 1), 900);
    return () => clearTimeout(timerRef.current);
  });

  const round = rounds[activeRound] || {};
  const course = courses[round.courseId || activeRound];

  const playerData = course ? players.map((p, idx) => {
    const chcp = playerCourseHcp(p, course);
    const ps = (round.scores || {})[p.id] || [];
    const holes = course.par.map((par, h) => {
      const gross = ps[h] || 0;
      if (!gross) return null;
      const siVal = course.si?.[h] ?? (h + 1);
      const net = netHole(gross, chcp, siVal);
      return { gross, net, nvp: net - par };
    });
    let running = 0;
    const cum = [0];
    for (let h = 0; h < 18; h++) {
      if (holes[h]) running += holes[h].nvp;
      cum.push(running);
    }
    const holesPlayed = holes.filter(Boolean).length;
    return { player: p, chcp, holes, cum, holesPlayed, total: running, color: PLAYER_COLORS[idx % 12] };
  }).filter(pd => pd.holesPlayed > 0) : [];

  const maxHole = playerData.length > 0 ? Math.max(...playerData.map(pd => pd.holesPlayed)) : 18;

  const doPlay = () => {
    if (playing) { setPlaying(false); return; }
    if (playHole >= maxHole) setPlayHole(0);
    setPlaying(true);
  };
  const doNext = () => { setPlaying(false); setPlayHole(h => Math.min(maxHole, h + 1)); };
  const doReset = () => { setPlaying(false); setPlayHole(0); };

  const series = playerData.map(pd => ({
    name: pd.player.name,
    color: pd.color,
    cum: pd.cum.slice(0, playHole + 1),
  }));

  const ctrlBtn = {
    padding: "7px 14px", borderRadius: "7px",
    border: "1px solid #c8d0c8", background: "#fff",
    color: CREAM, fontFamily: FB, fontSize: "12px",
    fontWeight: 600, cursor: "pointer",
  };

  const sortedPlayers = [...playerData].sort((a, b) => {
    const aV = a.cum[Math.min(playHole, a.holesPlayed)];
    const bV = b.cum[Math.min(playHole, b.holesPlayed)];
    return aV - bV;
  });

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "22px 14px 40px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        Round Replay
      </div>
      <div style={{ color: M, fontSize: "14px", marginBottom: "18px" }}>
        Hole-by-hole net score progression · entire field
      </div>

      <div className="round-tabs" style={{ marginBottom: "20px" }}>
        {[1, 2, 3].map(r => {
          const hasScores = rounds[r] && Object.keys(rounds[r].scores || {}).length > 0;
          return (
            <button key={r} onClick={() => setActiveRound(r)}
              className={`round-tab${activeRound === r ? " active" : ""}`}>
              Round {r}
              {hasScores && <span style={{ marginLeft: "4px", color: G, fontSize: "9px" }}>●</span>}
            </button>
          );
        })}
      </div>

      {!course ? (
        <div style={{ textAlign: "center", color: M, padding: "40px 0", fontSize: "14px" }}>
          Course not set up for Round {activeRound}.
        </div>
      ) : playerData.length === 0 ? (
        <div style={{ textAlign: "center", color: M, padding: "40px 0", fontSize: "14px" }}>
          No scores entered yet for Round {activeRound}.
        </div>
      ) : (
        <>
          {/* Player legend */}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
            {sortedPlayers.map(pd => {
              const t = pd.cum[Math.min(playHole, pd.holesPlayed)];
              return (
                <div key={pd.player.id} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: pd.color, flexShrink: 0 }} />
                  <span style={{ fontSize: "12px", fontWeight: 600, color: CREAM }}>{pd.player.name.split(" ")[0]}</span>
                  {playHole > 0 && (
                    <span style={{ fontSize: "11px", fontWeight: 600, color: t < 0 ? R : t === 0 ? G : M }}>
                      {t > 0 ? `+${t}` : t === 0 ? "E" : t}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Controls */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" }}>
            <button onClick={doPlay} style={{ ...ctrlBtn, background: G, color: "#fff", border: "none", padding: "8px 18px" }}>
              {playing ? "⏸ Pause" : playHole >= maxHole ? "↩ Replay" : playHole === 0 ? "▶ Play" : "▶ Resume"}
            </button>
            <button onClick={doNext} disabled={playHole >= maxHole}
              style={{ ...ctrlBtn, opacity: playHole >= maxHole ? 0.4 : 1 }}>Next →</button>
            <button onClick={doReset} disabled={playHole === 0}
              style={{ ...ctrlBtn, opacity: playHole === 0 ? 0.4 : 1 }}>↩ Reset</button>
            <span style={{ fontSize: "12px", color: M }}>
              {playHole === 0 ? "Before Round" : playHole >= maxHole ? `Hole ${playHole} · Final` : `Hole ${playHole} of ${maxHole}`}
            </span>
          </div>

          {/* Race chart */}
          <div style={{ background: "#fff", border: "1px solid #d0d8d0", borderRadius: "12px", padding: "14px 10px 8px", marginBottom: "16px" }}>
            <div style={{ fontSize: "10px", color: M, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "4px", paddingLeft: "4px" }}>
              Cumulative Net vs Par &nbsp;·&nbsp; lower is better
            </div>
            {playHole > 0
              ? <RaceChart series={series} par={course.par} />
              : <div style={{ height: "80px", display: "flex", alignItems: "center", justifyContent: "center", color: M, fontSize: "13px" }}>Press Play to begin</div>
            }
          </div>

          {/* Hole-by-hole table */}
          <div style={{ background: "#fff", border: "1px solid #d0d8d0", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px 6px", fontSize: "10px", color: M, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              Hole by Hole &nbsp;·&nbsp; Net vs Par
            </div>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ borderCollapse: "collapse", fontSize: "12px", minWidth: "600px", width: "100%" }}>
                <thead>
                  <tr style={{ background: CARD2 }}>
                    <th style={{ textAlign: "left", padding: "5px 10px 5px 14px", fontSize: "10px", color: M, fontWeight: 600, minWidth: "120px", whiteSpace: "nowrap" }}>Player</th>
                    {course.par.map((par, hi) => (
                      <th key={hi} style={{
                        textAlign: "center", padding: "3px 2px 5px", minWidth: "30px",
                        fontSize: "10px",
                        color: hi + 1 <= playHole ? CREAM : "#c0ccc0",
                        fontWeight: hi + 1 === playHole ? 800 : 400,
                        borderLeft: hi === 9 ? "2px solid #b0c0b0" : "none",
                      }}>
                        <div style={{ fontWeight: 600 }}>{hi + 1}</div>
                        <div style={{ color: M }}>P{par}</div>
                      </th>
                    ))}
                    <th style={{ textAlign: "center", padding: "5px 10px", color: GO, fontWeight: 700, fontSize: "11px", borderLeft: "1px solid #c0ccc0", whiteSpace: "nowrap" }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((pd) => {
                    const total = pd.cum[Math.min(playHole, pd.holesPlayed)];
                    return (
                      <tr key={pd.player.id} style={{ borderTop: "1px solid #e8ede8" }}>
                        <td style={{ padding: "6px 10px 6px 14px", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: pd.color, flexShrink: 0 }} />
                            <span style={{ fontSize: "12px", fontWeight: 600, color: CREAM }}>{pd.player.name}</span>
                          </div>
                          <div style={{ fontSize: "10px", color: M, paddingLeft: "13px" }}>HCP {pd.chcp}</div>
                        </td>
                        {pd.holes.map((h, hi) => {
                          const revealed = hi + 1 <= playHole;
                          const isCur = hi + 1 === playHole;
                          return (
                            <td key={hi} style={{
                              textAlign: "center", padding: "5px 2px",
                              background: revealed && h ? nvpBg(h.nvp) : "transparent",
                              boxShadow: isCur ? "inset 0 0 0 2px #1a6b3a55" : "none",
                              opacity: revealed ? 1 : 0.12,
                              borderLeft: hi === 9 ? "2px solid #b0c0b0" : "none",
                              transition: "opacity 0.25s",
                            }}>
                              {h && revealed ? (
                                <>
                                  <div style={{ fontSize: "12px", fontWeight: 700, color: nvpColor(h.nvp) }}>
                                    {h.nvp > 0 ? `+${h.nvp}` : h.nvp === 0 ? "E" : h.nvp}
                                  </div>
                                  <div style={{ fontSize: "9px", color: M }}>{h.gross}</div>
                                </>
                              ) : (
                                <span style={{ fontSize: "10px", color: "#c0ccc0" }}>—</span>
                              )}
                            </td>
                          );
                        })}
                        <td style={{
                          textAlign: "center", padding: "5px 10px",
                          fontWeight: 700, fontSize: "14px",
                          borderLeft: "1px solid #c0ccc0",
                          color: total < 0 ? R : total === 0 ? G : CREAM,
                        }}>
                          {playHole > 0 ? (total > 0 ? `+${total}` : total === 0 ? "E" : total) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(0,0,0,0.05)", fontSize: "11px", color: M }}>
              Net vs par per hole · sorted by running total · hover chart to inspect
            </div>
          </div>
        </>
      )}
    </div>
  );
}
