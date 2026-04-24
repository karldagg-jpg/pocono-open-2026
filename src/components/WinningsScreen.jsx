import { CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { calcWinnings, calcLeaderboard, calcScatts } from "../lib/golfLogic";

export default function WinningsScreen({ event }) {
  const { players = [], courses = {}, rounds = {}, buyIn = 100 } = event;
  const winnings = calcWinnings(event);
  const board = calcLeaderboard(event);

  // Scatts breakdown per round
  const scattsByRound = [1, 2, 3].map((rNum) => {
    const round = rounds[rNum];
    if (!round) return null;
    const course = courses[round.courseId];
    if (!course || !Object.keys(round.scores || {}).length) return null;
    return calcScatts(round.scores || {}, course, players, buyIn);
  });

  // Total spent
  const roundsWithCourse = [1, 2, 3].filter((r) => {
    const round = rounds[r];
    return round && courses[round.courseId] && Object.keys(round.scores || {}).length;
  });
  const totalSpent = players.length * buyIn * roundsWithCourse.length;
  const totalPaidOut = Object.values(winnings).reduce((a, b) => a + b.scatts, 0);

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        Winnings
      </div>
      <div style={{ color: M, fontSize: "14px", marginBottom: "18px" }}>
        Scatts across all rounds · ${buyIn}/player/round
      </div>

      {/* Pot summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" }}>
        <StatBox label="Total Collected" value={`$${totalSpent.toLocaleString()}`} color={GOLD} />
        <StatBox label="Paid Out" value={`$${totalPaidOut.toLocaleString()}`} color={GO} />
      </div>

      {/* Per-round scatt summaries */}
      <div style={{ display: "grid", gap: "8px", marginBottom: "20px" }}>
        {[0, 1, 2].map((ri) => {
          const r = scattsByRound[ri];
          if (!r) return (
            <div key={ri} style={{ background: CARD2, border: `1px solid rgba(201,168,76,0.15)`, borderRadius: "10px", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: M, fontSize: "13px" }}>Round {ri + 1}</span>
              <span style={{ color: M, fontSize: "12px" }}>Not scored</span>
            </div>
          );
          return (
            <div key={ri} style={{ background: CARD2, border: `1px solid ${G}33`, borderRadius: "10px", padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ color: CREAM, fontSize: "13px", fontWeight: 600 }}>Round {ri + 1}</span>
                <span style={{ color: GO, fontSize: "13px" }}>
                  ${r.totalPot.toLocaleString()} · {r.totalScatts} scatts · ${r.scattValue.toFixed(0)}/scatt
                </span>
              </div>
              <div style={{ fontSize: "12px", color: M }}>
                {Object.entries(r.holeWinners).map(([pid, n]) => {
                  const p = players.find((pl) => pl.id === Number(pid));
                  return `${p?.name}: ${n}`;
                }).join(" · ") || "No holes won"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Player totals */}
      <div style={{ background: CARD2, border: `1px solid rgba(201,168,76,0.15)`, borderRadius: "12px", overflow: "clip" }}>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid rgba(201,168,76,0.2)`, fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
          Player Summary
        </div>
        {players
          .map((p) => ({ p, w: winnings[p.id] || { scatts: 0, total: 0 } }))
          .sort((a, b) => b.w.total - a.w.total)
          .map(({ p, w }) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderBottom: `1px solid rgba(201,168,76,0.08)` }}>
              <div style={{ flex: 1, fontSize: "14px", color: w.scatts > 0 ? CREAM : M }}>{p.name}</div>
              <div style={{ fontSize: "12px", color: G }}>{
                [1, 2, 3].map((rNum) => {
                  const r = scattsByRound[rNum - 1];
                  if (!r) return null;
                  const s = r.holeWinners[p.id] || 0;
                  return s > 0 ? `R${rNum}: ${s}` : null;
                }).filter(Boolean).join(" · ") || "0 scatts"
              }</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: w.scatts > 0 ? GO : M, minWidth: "60px", textAlign: "right" }}>
                ${w.scatts.toLocaleString()}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div className="stat-box">
      <div className="val" style={{ color }}>{value}</div>
      <div className="lbl">{label}</div>
    </div>
  );
}
