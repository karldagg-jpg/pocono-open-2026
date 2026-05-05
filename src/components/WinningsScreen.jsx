import { CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { calcWinnings, calcLeaderboard, calcScatts, calcLowNet, calcCTP } from "../lib/golfLogic";

export default function WinningsScreen({ event }) {
  const { players = [], courses = {}, rounds = {}, buyIn = 100, games = {} } = event;
  const winnings = calcWinnings(event);

  const scattsBuyIn = games.scatts?.enabled && games.scatts?.pot != null
    ? games.scatts.pot / Math.max(players.length, 1)
    : buyIn;

  const scattsByRound = [1, 2, 3].map((rNum) => {
    const round = rounds[rNum];
    if (!round) return null;
    const course = courses[round.courseId];
    if (!course || !Object.keys(round.scores || {}).length) return null;
    return calcScatts(round.scores || {}, course, players, scattsBuyIn);
  });

  const { payouts: lnPayouts, positions: lnPositions, pot: lnPot, pcts: lnPcts, prizes: lnPrizes } = calcLowNet(event);
  const { payouts: ctpPayouts, totalWins: ctpWins, perWin: ctpPerWin, pot: ctpPot, ctpResults } = calcCTP(event);

  const numRounds = [1, 2, 3].filter((r) => rounds[r] && courses[rounds[r]?.courseId] && Object.keys(rounds[r]?.scores || {}).length).length;
  const totalCollected = players.length * buyIn * numRounds;
  const totalPaidOut = Object.values(winnings).reduce((a, b) => a + b.total, 0);

  const ctpHoles = games.ctp?.holes || {};

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        Winnings
      </div>
      <div style={{ color: M, fontSize: "14px", marginBottom: "18px" }}>
        ${buyIn}/player/round · {players.length} players
      </div>

      {/* Pot summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" }}>
        <StatBox label="Total Collected" value={`$${totalCollected.toLocaleString()}`} color={GOLD} />
        <StatBox label="Paid Out" value={`$${totalPaidOut.toLocaleString()}`} color={GO} />
      </div>

      {/* ── Scatts ── */}
      {(games.scatts?.enabled !== false) && (
        <Section title="Scats / Skins" pot={games.scatts?.pot} color={G}>
          {scattsByRound.map((r, ri) => {
            if (!r) return (
              <div key={ri} style={{ padding: "10px 14px", borderBottom: `1px solid rgba(201,168,76,0.08)`, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: M, fontSize: "13px" }}>Round {ri + 1}</span>
                <span style={{ color: M, fontSize: "12px" }}>Not scored</span>
              </div>
            );
            return (
              <div key={ri} style={{ padding: "10px 14px", borderBottom: `1px solid rgba(201,168,76,0.08)` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ color: CREAM, fontSize: "13px", fontWeight: 600 }}>Round {ri + 1}</span>
                  <span style={{ color: GO, fontSize: "12px" }}>
                    ${r.totalPot.toLocaleString()} · {r.totalScatts} holes · ${r.scattValue.toFixed(0)}/hole
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: M }}>
                  {Object.entries(r.holeWinners).map(([pid, n]) => {
                    const p = players.find((pl) => pl.id === Number(pid));
                    return `${p?.name}: ${n}`;
                  }).join(" · ") || "No holes won yet"}
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {/* ── Low Net Tournament ── */}
      {(games.lowNet?.enabled !== false) && (
        <Section title="Low Net Tournament" pot={lnPot} color={GO}>
          {lnPositions.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: "13px", color: M }}>
              Complete all 3 rounds to see tournament results.
            </div>
          ) : (
            <>
              {lnPositions.slice(0, 3).map((group, posIdx) => {
                const prize = lnPrizes?.[posIdx] || 0;
                const pct = lnPcts?.[posIdx] || 0;
                const isTie = group.length > 1;
                const share = isTie ? Math.round(prize / group.length) : prize;
                return (
                  <div key={posIdx} style={{ padding: "10px 14px", borderBottom: `1px solid rgba(201,168,76,0.08)` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: posIdx === 0 ? GO : posIdx === 1 ? "#c0a060" : G, minWidth: "28px" }}>
                        {posIdx + 1}{isTie ? "T" : ""}
                      </div>
                      <div style={{ flex: 1 }}>
                        {group.map((r) => (
                          <div key={r.player.id} style={{ fontSize: "13px", color: CREAM }}>{r.player.name}</div>
                        ))}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "15px", fontWeight: 700, color: GO }}>${share.toLocaleString()}</div>
                        <div style={{ fontSize: "10px", color: M }}>
                          {isTie ? `split ${pct}%` : `${pct}%`} · Net {group[0].total}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {lnPositions.length > 3 && (
                <div style={{ padding: "8px 14px", fontSize: "12px", color: M }}>
                  + {lnPositions.slice(3).flat().length} more players not in prize positions
                </div>
              )}
            </>
          )}
        </Section>
      )}

      {/* ── Closest to Pin ── */}
      {(games.ctp?.enabled !== false) && (
        <Section title="Closest to Pin" pot={ctpPot} color={GOLD}>
          {[1, 2, 3].map((rNum) => {
            const holes = ctpHoles[rNum] || [];
            if (!holes.length) return (
              <div key={rNum} style={{ padding: "10px 14px", borderBottom: `1px solid rgba(201,168,76,0.08)`, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: M, fontSize: "13px" }}>Round {rNum}</span>
                <span style={{ color: M, fontSize: "12px" }}>No holes configured</span>
              </div>
            );
            return (
              <div key={rNum} style={{ padding: "10px 14px", borderBottom: `1px solid rgba(201,168,76,0.08)` }}>
                <div style={{ fontSize: "13px", color: CREAM, fontWeight: 600, marginBottom: "6px" }}>Round {rNum}</div>
                {holes.map((holeIdx) => {
                  const winnerId = ctpResults?.[rNum]?.[holeIdx];
                  const winner = players.find((p) => p.id === winnerId);
                  return (
                    <div key={holeIdx} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                      <span style={{ color: M }}>Hole {holeIdx + 1}</span>
                      <span style={{ color: winner ? CREAM : M }}>
                        {winner ? `${winner.name} · $${ctpPerWin?.toLocaleString() || "—"}` : "Not recorded"}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </Section>
      )}

      {/* ── Player Summary ── */}
      <div className="card2">
        <div className="card-header">Player Summary</div>
        {players
          .map((p) => ({ p, w: winnings[p.id] || { scatts: 0, lowNet: 0, ctp: 0, total: 0 } }))
          .sort((a, b) => b.w.total - a.w.total)
          .map(({ p, w }) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderBottom: `1px solid rgba(201,168,76,0.08)` }}>
              <div style={{ flex: 1, fontSize: "14px", color: w.total > 0 ? CREAM : M }}>{p.name}</div>
              <div style={{ fontSize: "11px", color: M, textAlign: "right" }}>
                {w.scatts > 0 && <span style={{ color: G }}>Scats ${w.scatts} </span>}
                {w.lowNet > 0 && <span style={{ color: GO }}>LN ${w.lowNet} </span>}
                {w.ctp > 0 && <span style={{ color: GOLD }}>CTP ${w.ctp}</span>}
              </div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: w.total > 0 ? GO : M, minWidth: "64px", textAlign: "right" }}>
                ${w.total.toLocaleString()}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function Section({ title, pot, color, children }) {
  return (
    <div className="card2" style={{ marginBottom: "16px" }}>
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ color }}>{title}</span>
        {pot > 0 && <span style={{ color: GO }}>${pot.toLocaleString()} pot</span>}
      </div>
      {children}
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
