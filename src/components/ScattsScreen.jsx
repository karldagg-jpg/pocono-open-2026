import { useState } from "react";
import { CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { calcScatts, playerCourseHcp } from "../lib/golfLogic";

export default function ScattsScreen({ event }) {
  const { players = [], courses = {}, rounds = {}, buyIn = 100, games = {} } = event;
  const [activeRound, setActiveRound] = useState(1);

  const round = rounds[activeRound] || {};
  const course = courses[round.courseId || activeRound];
  // Use allocated scatts pot if configured, otherwise fall back to full buy-in
  const scattsBuyIn = games.scatts?.enabled && games.scatts?.pot != null
    ? games.scatts.pot / Math.max(players.length, 1)
    : buyIn;
  const totalPot = players.length * scattsBuyIn;

  const result = course && Object.keys(round.scores || {}).length
    ? calcScatts(round.scores || {}, course, players, scattsBuyIn)
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
      <div className="round-tabs">
        {[1, 2, 3].map((r) => (
          <button key={r} onClick={() => setActiveRound(r)}
            className={`round-tab${activeRound === r ? " active" : ""}`}>
            Round {r}
          </button>
        ))}
      </div>

      {result ? (
        <>
          {/* Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "18px" }}>
            <div className="stat-box">
              <div className="val" style={{ color: GO }}>${result.totalPot.toLocaleString()}</div>
              <div className="lbl">Total Pot</div>
            </div>
            <div className="stat-box">
              <div className="val" style={{ color: G }}>{result.totalScatts}</div>
              <div className="lbl">Scatts Won</div>
            </div>
            <div className="stat-box">
              <div className="val" style={{ color: GOLD }}>{result.totalScatts ? `$${result.scattValue.toFixed(0)}` : "—"}</div>
              <div className="lbl">Per Scatt</div>
            </div>
          </div>

          {/* Player payouts */}
          {Object.keys(result.holeWinners).length > 0 && (
            <div className="card2" style={{ marginBottom: "16px" }}>
              <div className="card-header">Payouts</div>
              {Object.entries(result.holeWinners)
                .sort((a, b) => b[1] - a[1])
                .map(([pid, scatts]) => {
                  const p = players.find((pl) => pl.id === Number(pid));
                  const payout = scatts * result.scattValue;
                  return (
                    <div key={pid} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderBottom: `1px solid rgba(201,168,76,0.08)` }}>
                      <div style={{ flex: 1, fontSize: "14px", color: CREAM }}>{p?.name || "?"}</div>
                      <div style={{ fontSize: "13px", color: G }}>{scatts} scatt{scatts !== 1 ? "s" : ""}</div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: GO }}>${Math.round(payout)}</div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Hole-by-hole results */}
          <div className="card2">
            <div className="card-header">Hole Results</div>
            {result.holeResults.map((hr) => (
              <div key={hr.hole} style={{
                display: "flex", alignItems: "center", gap: "10px", padding: "8px 14px",
                borderBottom: `1px solid rgba(201,168,76,0.08)`,
                background: hr.winner ? G + "0a" : "transparent",
              }}>
                <div style={{ width: "28px", textAlign: "center", fontSize: "12px", fontWeight: 700, color: GOLD }}>
                  {hr.hole}
                </div>
                <div style={{ flex: 1, fontSize: "13px", color: hr.winner ? CREAM : M }}>
                  {hr.winner ? hr.winner.name : hr.push ? "Push" : "—"}
                </div>
                {hr.winner && <div style={{ fontSize: "13px", color: GO, fontWeight: 700 }}>★</div>}
                {hr.winner && <div style={{ fontSize: "12px", color: G }}>Net {hr.net}</div>}
                {hr.push && (
                  <div style={{ fontSize: "11px", color: M }}>
                    {hr.tied?.map((t) => t.name).join(", ")}
                  </div>
                )}
              </div>
            ))}
            <div style={{ padding: "8px 14px", borderTop: `1px solid rgba(255,255,255,0.06)`, fontSize: "11px", color: M }}>
              Tied holes are a push — nobody wins
            </div>
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
