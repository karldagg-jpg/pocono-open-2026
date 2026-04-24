import { useState, useEffect } from "react";
import { CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";

const DEFAULT_GAMES = {
  scatts:  { enabled: true,  pot: 0, label: "Scatts / Skins" },
  lowNet:  { enabled: true,  pot: 0, payoutPcts: [50, 30, 20], minRounds: 3, label: "Low Net Tournament" },
  ctp:     { enabled: true,  pot: 0, holes: {}, results: {}, label: "Closest to Pin" },
};

const GAME_KEYS = ["scatts", "lowNet", "ctp"];

export default function GamesScreen({ event, saveEvent }) {
  const { players = [], courses = {}, buyIn = 100, games: savedGames = {} } = event;

  // Merge saved games with defaults
  const [games, setGames] = useState(() => {
    const g = {};
    GAME_KEYS.forEach((k) => {
      g[k] = { ...DEFAULT_GAMES[k], ...(savedGames[k] || {}) };
    });
    return g;
  });

  const [ctpRound, setCtpRound] = useState(1);

  const numPlayers = players.length || 0;
  const numRounds = 3;
  const totalPerPlayer = buyIn * numRounds;
  const totalPot = numPlayers * buyIn * numRounds;

  // Sum of allocated pots
  const allocated = GAME_KEYS.filter((k) => games[k].enabled).reduce((sum, k) => sum + (Number(games[k].pot) || 0), 0);
  const remaining = totalPot - allocated;

  function updateGame(key, field, val) {
    setGames((g) => ({ ...g, [key]: { ...g[key], [field]: val } }));
  }

  function setAllEqual() {
    const enabled = GAME_KEYS.filter((k) => games[k].enabled);
    if (!enabled.length) return;
    const share = Math.floor(totalPot / enabled.length);
    const remainder = totalPot - share * enabled.length;
    const next = { ...games };
    enabled.forEach((k, i) => {
      next[k] = { ...next[k], pot: share + (i === 0 ? remainder : 0) };
    });
    setGames(next);
  }

  function updatePayoutPct(idx, val) {
    const pcts = [...(games.lowNet.payoutPcts || [50, 30, 20])];
    pcts[idx] = Number(val) || 0;
    updateGame("lowNet", "payoutPcts", pcts);
  }

  function toggleCtpHole(roundNum, holeIdx) {
    const current = games.ctp.holes || {};
    const roundHoles = current[roundNum] || [];
    const next = roundHoles.includes(holeIdx)
      ? roundHoles.filter((h) => h !== holeIdx)
      : [...roundHoles, holeIdx];
    updateGame("ctp", "holes", { ...current, [roundNum]: next });
  }

  function setCTPWinner(roundNum, holeIdx, pid) {
    const current = games.ctp.results || {};
    const roundResults = { ...(current[roundNum] || {}) };
    if (pid === "") {
      delete roundResults[holeIdx];
    } else {
      roundResults[holeIdx] = Number(pid);
    }
    updateGame("ctp", "results", { ...current, [roundNum]: roundResults });
  }

  function save() {
    saveEvent({ ...event, games });
  }

  const pcts = games.lowNet.payoutPcts || [50, 30, 20];
  const pctSum = pcts.reduce((a, b) => a + (Number(b) || 0), 0);
  const ctpHoles = games.ctp.holes || {};
  const ctpResults = games.ctp.results || {};

  // Par 3 holes for the active CTP round
  const ctpRoundData = event.rounds?.[ctpRound];
  const ctpCourse = ctpRoundData ? courses[ctpRoundData.courseId] : null;
  const par3Holes = ctpCourse
    ? ctpCourse.par.map((p, i) => ({ idx: i, par: p })).filter((h) => h.par === 3)
    : [];

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        Games & Pots
      </div>
      <div style={{ color: M, fontSize: "14px", marginBottom: "20px" }}>
        ${buyIn}/player/round · {numPlayers} players · {numRounds} rounds · Total pot ${totalPot.toLocaleString()}
      </div>

      {/* Pot allocation */}
      <div className="card2" style={{ marginBottom: "16px" }}>
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Pot Allocation</span>
          <button onClick={setAllEqual} className="btn-ghost" style={{ fontSize: "11px", padding: "3px 10px" }}>
            Split equally
          </button>
        </div>

        {GAME_KEYS.map((key) => {
          const g = games[key];
          return (
            <div key={key} style={{ padding: "12px 14px", borderBottom: `1px solid rgba(201,168,76,0.08)`, display: "flex", alignItems: "center", gap: "12px" }}>
              <input
                type="checkbox"
                checked={g.enabled}
                onChange={(e) => updateGame(key, "enabled", e.target.checked)}
                style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: G }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", color: g.enabled ? CREAM : M }}>{g.label}</div>
                {key === "scatts" && <div style={{ fontSize: "11px", color: M }}>Per round · {numRounds} rounds</div>}
                {key === "lowNet" && <div style={{ fontSize: "11px", color: M }}>Tournament · all 3 rounds</div>}
                {key === "ctp" && <div style={{ fontSize: "11px", color: M }}>Par 3s · configure holes below</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "13px", color: M }}>$</span>
                <input
                  type="number"
                  value={g.pot || ""}
                  onChange={(e) => updateGame(key, "pot", Number(e.target.value) || 0)}
                  disabled={!g.enabled}
                  min="0"
                  style={{
                    width: "80px", padding: "7px 10px", textAlign: "right",
                    borderRadius: "7px", border: `1px solid rgba(201,168,76,0.2)`,
                    background: g.enabled ? "rgba(26,61,36,0.15)" : "transparent",
                    color: g.enabled ? CREAM : M,
                    fontFamily: FB, fontSize: "14px", fontWeight: 600, outline: "none",
                  }}
                />
              </div>
            </div>
          );
        })}

        {/* Remaining / over */}
        <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
          <span style={{ color: M }}>Allocated</span>
          <span style={{ color: Math.abs(remaining) < 1 ? G : R, fontWeight: 600 }}>
            ${allocated.toLocaleString()} / ${totalPot.toLocaleString()}
            {remaining !== 0 && ` · ${remaining > 0 ? `$${remaining} unallocated` : `$${Math.abs(remaining)} over`}`}
          </span>
        </div>
      </div>

      {/* Low Net payout % config */}
      {games.lowNet.enabled && (
        <div className="card2" style={{ marginBottom: "16px" }}>
          <div className="card-header">Low Net Payout Split</div>
          <div style={{ padding: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
              {["1st", "2nd", "3rd"].map((place, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "11px", color: M, marginBottom: "5px" }}>{place}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                    <input
                      type="number"
                      value={pcts[i] ?? ""}
                      onChange={(e) => updatePayoutPct(i, e.target.value)}
                      min="0" max="100"
                      style={{
                        width: "60px", padding: "8px 6px", textAlign: "center",
                        borderRadius: "7px", border: `1px solid rgba(201,168,76,0.2)`,
                        background: "rgba(26,61,36,0.15)", color: CREAM,
                        fontFamily: FB, fontSize: "16px", fontWeight: 700, outline: "none",
                      }}
                    />
                    <span style={{ color: M, fontSize: "13px" }}>%</span>
                  </div>
                  <div style={{ fontSize: "11px", color: GO, marginTop: "4px" }}>
                    ${Math.round((games.lowNet.pot || 0) * (pcts[i] || 0) / 100).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center", fontSize: "12px", color: pctSum === 100 ? G : R }}>
              Total: {pctSum}% {pctSum !== 100 && "— must equal 100%"}
            </div>
          </div>
        </div>
      )}

      {/* CTP hole config */}
      {games.ctp.enabled && (
        <div className="card2" style={{ marginBottom: "16px" }}>
          <div className="card-header">Closest to Pin — Holes & Winners</div>
          <div style={{ padding: "10px 14px 4px" }}>
            <div className="round-tabs">
              {[1, 2, 3].map((r) => (
                <button key={r} onClick={() => setCtpRound(r)}
                  className={`round-tab${ctpRound === r ? " active" : ""}`}>
                  Round {r}
                </button>
              ))}
            </div>
          </div>

          {par3Holes.length === 0 ? (
            <div style={{ padding: "14px", fontSize: "13px", color: M }}>
              {ctpCourse ? "No par 3s found on this course." : "Assign a course to Round " + ctpRound + " first."}
            </div>
          ) : (
            par3Holes.map(({ idx }) => {
              const isSelected = (ctpHoles[ctpRound] || []).includes(idx);
              const winnerId = ctpResults[ctpRound]?.[idx];
              const winner = players.find((p) => p.id === winnerId);
              return (
                <div key={idx} style={{ padding: "10px 14px", borderBottom: `1px solid rgba(201,168,76,0.08)`, display: "flex", alignItems: "center", gap: "12px" }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleCtpHole(ctpRound, idx)}
                    style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: G }}
                  />
                  <div style={{ fontSize: "13px", color: isSelected ? CREAM : M, flex: 1 }}>
                    Hole {idx + 1} · Par 3
                  </div>
                  {isSelected && (
                    <select
                      value={winnerId || ""}
                      onChange={(e) => setCTPWinner(ctpRound, idx, e.target.value)}
                      style={{
                        padding: "6px 10px", borderRadius: "7px",
                        border: `1px solid rgba(201,168,76,0.2)`,
                        background: "#1a2a1c", color: winnerId ? CREAM : M,
                        fontFamily: FB, fontSize: "13px", outline: "none", cursor: "pointer",
                      }}
                    >
                      <option value="">— Winner —</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <button onClick={save} className="btn" style={{ width: "100%", padding: "12px" }}>
        Save Games & Pots
      </button>
    </div>
  );
}
