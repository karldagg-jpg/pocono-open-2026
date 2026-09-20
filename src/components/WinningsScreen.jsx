import { CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { calcWinnings, calcLeaderboard, calcScatts, calcLowNet, calcCTP, calcBirdiePool, calcHIOBonus, gamblingPlayers, birdiePoolPlayers } from "../lib/golfLogic";
import { settleWeekend, settlementTransfers } from "../lib/settlement";
import { useState } from "react";

const money = (n) => `${n < 0 ? "−" : "+"}$${Math.abs(n).toLocaleString()}`;

export default function WinningsScreen({ event, library }) {
  const [showTransfers, setShowTransfers] = useState(false);
  const { players = [], rounds = {}, buyIn = 100, weekendBuyIn, games = {} } = event;
  const courses = { ...(event.courses || {}), ...library };
  const eventForCalc = { ...event, courses };
  const winnings = calcWinnings(eventForCalc);
  const settlement = settleWeekend(eventForCalc);
  const transfers = settlementTransfers(settlement.rows);

  const potByRound = games.scatts?.potByRound;
  const scattsByRound = [1, 2, 3].map((rNum) => {
    const round = rounds[rNum];
    if (!round) return null;
    const course = courses[round.courseId];
    if (!course || !Object.keys(round.scores || {}).length) return null;
    let roundBuyIn;
    if (potByRound?.[rNum]) {
      roundBuyIn = potByRound[rNum] / Math.max(players.length, 1);
    } else if (games.scatts?.enabled && games.scatts?.pot) {
      roundBuyIn = games.scatts.pot / 3 / Math.max(players.length, 1);
    } else {
      roundBuyIn = buyIn;
    }
    return calcScatts(round.scores || {}, course, players, roundBuyIn);
  });

  const hioResult = (games.hio?.enabled && games.hio?.pot) ? calcHIOBonus(eventForCalc) : null;

  const { payouts: lnPayouts, positions: lnPositions, pot: lnPot, pcts: lnPcts, prizes: lnPrizes } = calcLowNet(eventForCalc);
  const { payouts: ctpPayouts, totalWins: ctpWins, perWin: ctpPerWin, pot: ctpPot, ctpResults } = calcCTP(eventForCalc);

  const bpConfig = games.birdiePool;
  const birdiePoolEnabled = bpConfig === true || (bpConfig && typeof bpConfig === "object" && bpConfig.enabled !== false);
  const gpPlayers = gamblingPlayers(eventForCalc);
  const bpPlayers = birdiePoolPlayers(eventForCalc);
  const birdieByRound = birdiePoolEnabled ? [1, 2, 3].map(rNum => {
    const roundEnabled = bpConfig === true || bpConfig?.[rNum] !== false;
    if (!roundEnabled) return null;
    const round = rounds[rNum];
    if (!round) return null;
    const course = courses[round.courseId];
    if (!course || !Object.keys(round.scores || {}).length) return null;
    return calcBirdiePool(round.scores || {}, course, bpPlayers);
  }) : [null, null, null];

  // Sum birdie pool balances across all rounds
  const birdieNetBalance = {};
  bpPlayers.forEach(p => { birdieNetBalance[p.id] = 0; });
  birdieByRound.forEach(r => {
    if (!r) return;
    bpPlayers.forEach(p => { birdieNetBalance[p.id] += r.netBalance[p.id] || 0; });
  });

  const numRounds = [1, 2, 3].filter((r) => rounds[r] && courses[rounds[r]?.courseId] && Object.keys(rounds[r]?.scores || {}).length).length;
  const totalCollected = weekendBuyIn
    ? players.length * weekendBuyIn
    : players.length * buyIn * numRounds;
  const totalPaidOut = Object.values(winnings).reduce((a, b) => a + b.total, 0);

  const ctpHoles = games.ctp?.holes || {};

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        Winnings
      </div>
      <div style={{ color: M, fontSize: "14px", marginBottom: "18px" }}>
        ${weekendBuyIn ?? buyIn}/player · {players.length} players
      </div>

      {/* Pot summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" }}>
        <StatBox label="Total Collected" value={`$${totalCollected.toLocaleString()}`} color={GOLD} />
        <StatBox label="Paid Out" value={`$${totalPaidOut.toLocaleString()}`} color={GO} />
      </div>

      {/* ── Settle up ──
          Every other section on this page answers "what did you win". This one
          answers the only question anyone asks in the car park: after the
          buy-in, am I up or down. */}
      <Section title="Settle Up" color={GOLD}>
        <div style={{ padding: "9px 14px", fontSize: "12px", color: M, borderBottom: `1px solid rgba(201,168,76,0.08)` }}>
          Winnings less the ${settlement.buyIn} buy-in. Positive means they collect.
        </div>

        {settlement.rows.map((r) => {
          const up = r.net > 0, flat = r.net === 0;
          return (
            <div key={r.player.id} style={{ padding: "9px 14px", borderBottom: `1px solid rgba(201,168,76,0.08)`, display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "14px", color: CREAM, fontWeight: 600 }}>
                  {r.player.name}
                  {!r.playing && <span style={{ color: M, fontWeight: 400, fontSize: "12px" }}> · not in</span>}
                </div>
                <div style={{ fontSize: "11px", color: M, marginTop: "2px" }}>
                  {[
                    r.staked ? `−$${r.staked} in` : null,
                    r.scatts ? `scats $${r.scatts}` : null,
                    r.lowNet ? `low net $${r.lowNet}` : null,
                    r.ctp ? `CTP $${r.ctp}` : null,
                    r.hio ? `HIO $${r.hio}` : null,
                    r.birdie ? `birdies ${money(r.birdie)}` : null,
                  ].filter(Boolean).join(" · ") || "no action"}
                </div>
              </div>
              <div style={{ fontFamily: FB, fontSize: "16px", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: flat ? M : up ? GO : R }}>
                {flat ? "$0" : money(r.net)}
              </div>
            </div>
          );
        })}

        {/* The books rarely balance exactly. Say so, rather than let someone
            find the gap themselves while holding the cash. */}
        {(settlement.totals.unallocated !== 0 || settlement.totals.payoutDrift !== 0) && (
          <div style={{ padding: "11px 14px", background: "rgba(201,168,76,0.05)", fontSize: "12px", color: M, lineHeight: 1.5 }}>
            <div style={{ color: GOLD, fontWeight: 600, marginBottom: "3px" }}>Reconciliation</div>
            ${settlement.totals.collected.toLocaleString()} collected · ${settlement.totals.pots.toLocaleString()} in the pots · ${settlement.totals.paidOut.toLocaleString()} paid out.
            {settlement.totals.unallocated !== 0 && (
              <> <strong style={{ color: CREAM }}>${Math.abs(settlement.totals.unallocated)}</strong>
                {settlement.totals.unallocated > 0 ? " collected isn't in any pot" : " more is in the pots than was collected"} — check the pot amounts on Games.</>
            )}
            {settlement.totals.payoutDrift !== 0 && (
              <> Payouts are ${Math.abs(settlement.totals.payoutDrift)} {settlement.totals.payoutDrift > 0 ? "over" : "under"} the pot total from rounding each scat share.</>
            )}
          </div>
        )}

        {settlement.staleOptOuts.length > 0 && (
          <div style={{ padding: "10px 14px", background: "rgba(201,168,76,0.05)", fontSize: "12px", color: M }}>
            {settlement.staleOptOuts.length} opt-out{settlement.staleOptOuts.length === 1 ? "" : "s"} left over from a player no longer on the roster. Harmless, but worth clearing on Players.
          </div>
        )}

        {transfers.length > 0 && (
          <div style={{ padding: "10px 14px" }}>
            <button onClick={() => setShowTransfers(!showTransfers)}
              style={{ border: "none", background: "transparent", color: GOLD, fontFamily: FB, fontSize: "13px", fontWeight: 600, cursor: "pointer", padding: 0 }}>
              {showTransfers ? "Hide" : "Show"} who pays whom ({transfers.length} payment{transfers.length === 1 ? "" : "s"})
            </button>
            {showTransfers && (
              <div style={{ marginTop: "9px" }}>
                {transfers.map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0", fontSize: "13px", color: CREAM }}>
                    <span style={{ minWidth: "72px" }}>{t.from}</span>
                    <span style={{ color: M }}>→</span>
                    <span style={{ flex: 1 }}>{t.to}</span>
                    <span style={{ fontFamily: FB, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: GO }}>${t.amount}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── Scatts ── */}
      {(games.scatts?.enabled !== false) && (
        /* The per-round pots are what actually gets played for; the flat `pot`
           field goes stale the moment a round is set individually. */
        <Section title="Scats / Skins" pot={settlement.pots.scatts} color={G}>
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
                  const dist = games.ctp?.distances?.[rNum]?.[holeIdx];
                  return (
                    <div key={holeIdx} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                      <span style={{ color: M }}>Hole {holeIdx + 1}</span>
                      <span style={{ color: winner ? CREAM : M }}>
                        {winner
                          ? `${winner.name}${dist ? ` · ${dist} ft` : ""} · $${ctpPerWin?.toLocaleString() || "—"}`
                          : "Not recorded"}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </Section>
      )}

      {/* ── HIO Bonus ── */}
      {hioResult && (
        <Section title="Hole in One Bonus" pot={hioResult.pot} color={GOLD}>
          {hioResult.hioWinners.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: "13px", color: M }}>No hole in ones recorded yet.</div>
          ) : hioResult.hioWinners.map((hw, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid rgba(201,168,76,0.08)` }}>
              <span style={{ fontSize: "13px", color: CREAM }}>{hw.player.name} · R{hw.round} H{hw.hole}</span>
              <span style={{ fontSize: "14px", fontWeight: 700, color: GO }}>${hioResult.perWinner.toLocaleString()}</span>
            </div>
          ))}
        </Section>
      )}

      {/* ── Birdie Pool ── */}
      {birdiePoolEnabled && (
        <Section title="Birdie / Eagle / HIO Pool" color={G}>
          {birdieByRound.map((r, ri) => {
            if (!r) return (
              <div key={ri} style={{ padding: "10px 14px", borderBottom: `1px solid rgba(201,168,76,0.08)`, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: M, fontSize: "13px" }}>Round {ri + 1}</span>
                <span style={{ color: M, fontSize: "12px" }}>Not scored</span>
              </div>
            );
            return (
              <div key={ri} style={{ padding: "10px 14px", borderBottom: `1px solid rgba(201,168,76,0.08)` }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: CREAM, marginBottom: "6px" }}>Round {ri + 1}</div>
                {r.holesDetail.length === 0 ? (
                  <div style={{ fontSize: "12px", color: M }}>No birdies or better yet</div>
                ) : r.holesDetail.map(hd => (
                  <div key={hd.hole} style={{ marginBottom: "4px" }}>
                    {hd.events.map((ev, ei) => {
                      const typeColor = ev.type === 'hio' ? GOLD : ev.type === 'eagle' ? GO : G;
                      const typeLabel = ev.type === 'hio' ? 'HIO' : ev.type === 'eagle' ? 'Eagle' : 'Birdie';
                      return (
                        <div key={ei} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "2px 0" }}>
                          <span style={{ color: M }}>H{hd.hole} · <span style={{ color: typeColor, fontWeight: 700 }}>{typeLabel}</span> · {ev.scorerName.split(" ")[0]}</span>
                          <span style={{ color: GO, fontWeight: 600 }}>+${ev.payout}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
          {/* Per-player net balance */}
          <div style={{ padding: "10px 14px" }}>
            <div style={{ fontSize: "11px", color: M, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: "8px" }}>Net Balance</div>
            {bpPlayers
              .map(p => ({ p, bal: birdieNetBalance[p.id] || 0 }))
              .sort((a, b) => b.bal - a.bal)
              .map(({ p, bal }) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", padding: "3px 0" }}>
                  <span style={{ color: bal > 0 ? CREAM : M }}>{p.name}</span>
                  <span style={{ fontWeight: 700, color: bal > 0 ? GO : bal < 0 ? R : M }}>
                    {bal > 0 ? `+$${bal}` : bal < 0 ? `-$${Math.abs(bal)}` : "—"}
                  </span>
                </div>
              ))}
          </div>
        </Section>
      )}

      {/* ── Player Summary ── */}
      <div className="card2">
        <div className="card-header">Player Summary</div>
        {players
          .map((p) => {
            const w = winnings[p.id] || { scatts: 0, lowNet: 0, ctp: 0, hio: 0, total: 0 };
            const birdieNet = birdieNetBalance[p.id] || 0;
            const netTotal = w.total + birdieNet;
            return { p, w, birdieNet, netTotal };
          })
          .sort((a, b) => b.netTotal - a.netTotal)
          .map(({ p, w, birdieNet, netTotal }) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderBottom: `1px solid rgba(201,168,76,0.08)` }}>
              <div style={{ flex: 1, fontSize: "14px", color: netTotal > 0 ? CREAM : M }}>{p.name}</div>
              <div style={{ fontSize: "11px", color: M, textAlign: "right" }}>
                {w.scatts > 0 && <span style={{ color: G }}>Scats ${w.scatts} </span>}
                {w.lowNet > 0 && <span style={{ color: GO }}>LN ${w.lowNet} </span>}
                {w.ctp > 0 && <span style={{ color: GOLD }}>CTP ${w.ctp} </span>}
                {w.hio > 0 && <span style={{ color: GOLD }}>HIO ${w.hio} </span>}
                {birdieNet !== 0 && <span style={{ color: birdieNet > 0 ? G : R }}>Birdie {birdieNet > 0 ? `+$${birdieNet}` : `-$${Math.abs(birdieNet)}`}</span>}
              </div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: netTotal > 0 ? GO : netTotal < 0 ? R : M, minWidth: "64px", textAlign: "right" }}>
                {netTotal >= 0 ? `$${netTotal.toLocaleString()}` : `-$${Math.abs(netTotal).toLocaleString()}`}
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
