import { useState } from "react";
import { CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { calcScatts, playerCourseHcp } from "../lib/golfLogic";

export default function ScattsScreen({ event }) {
  const { players = [], courses = {}, rounds = {}, buyIn = 100 } = event;
  const [activeRound, setActiveRound] = useState(1);

  const round = rounds[activeRound] || {};
  const course = courses[round.courseId || activeRound];
  const totalPot = players.length * buyIn;

  const result = course && Object.keys(round.scores || {}).length
    ? calcScatts(round.scores || {}, course, players, buyIn)
    : null;

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        Scatts
      </div>
      <div style={{ color: M, fontSize: "14px", marginBottom: "18px" }}>
        Net skins · ${buyIn}/player/round · Pot ${totalPot.toLocaleString()}
      </div>

      {/* Round tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "18px" }}>
        {[1, 2, 3].map((r) => (
          <button key={r} onClick={() => setActiveRound(r)} style={{
            flex: 1, padding: "9px", borderRadius: "10px",
            border: `1px solid ${activeRound === r ? G : GOLD + "33"}`,
            background: activeRound === r ? G + "22" : "transparent",
            color: activeRound === r ? CREAM : M,
            fontFamily: FB, fontSize: "13px", fontWeight: 600, cursor: "pointer",
          }}>Round {r}</button>
        ))}
      </div>

      {result ? (
        <>
          {/* Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "18px" }}>
            <StatBox label="Total Pot" value={`$${result.totalPot.toLocaleString()}`} color={GO} />
            <StatBox label="Scatts Won" value={result.totalScatts} color={G} />
            <StatBox label="Per Scatt" value={result.totalScatts ? `$${result.scattValue.toFixed(0)}` : "—"} color={GOLD} />
          </div>

          {/* Player payouts */}
          {Object.keys(result.holeWinners).length > 0 && (
            <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", marginBottom: "16px", overflow: "clip" }}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${GOLD}22`, fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
                Payouts
              </div>
              {Object.entries(result.holeWinners)
                .sort((a, b) => b[1] - a[1])
                .map(([pid, scatts]) => {
                  const p = players.find((pl) => pl.id === Number(pid));
                  const payout = scatts * result.scattValue;
                  return (
                    <div key={pid} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderBottom: `1px solid ${GOLD}11` }}>
                      <div style={{ flex: 1, fontSize: "14px", color: CREAM }}>{p?.name || "?"}</div>
                      <div style={{ fontSize: "13px", color: G }}>{scatts} scatt{scatts !== 1 ? "s" : ""}</div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: GO }}>${Math.round(payout)}</div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Hole-by-hole results */}
          <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", overflow: "clip" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${GOLD}22`, fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
              Hole Results
            </div>
            {result.holeResults.map((hr) => (
              <div key={hr.hole} style={{
                display: "flex", alignItems: "center", gap: "10px", padding: "8px 14px",
                borderBottom: `1px solid ${GOLD}11`,
                background: hr.winner ? G + "0a" : "transparent",
              }}>
                <div style={{ width: "28px", textAlign: "center", fontSize: "12px", fontWeight: 700, color: GOLD }}>
                  {hr.hole}
                </div>
                <div style={{ flex: 1, fontSize: "13px", color: hr.winner ? CREAM : M }}>
                  {hr.winner ? hr.winner.name : hr.push ? "Push" : "—"}
                </div>
                {hr.winner && <div style={{ fontSize: "12px", color: G }}>Net {hr.net}</div>}
                {hr.push && (
                  <div style={{ fontSize: "11px", color: M }}>
                    {hr.tied?.map((t) => t.name).join(", ")}
                  </div>
                )}
                {hr.winner && <div style={{ fontSize: "13px", color: GO, fontWeight: 700 }}>★</div>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ textAlign: "center", color: M, padding: "40px 0", fontSize: "14px" }}>
          {course ? "Scores not entered yet for this round." : "Course not set up for this round."}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: "#1a2a1c", border: `1px solid rgba(201,168,76,0.15)`, borderRadius: "10px", padding: "12px", textAlign: "center" }}>
      <div style={{ fontSize: "20px", fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: "10px", color: "#8a9e8c", marginTop: "3px", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}
