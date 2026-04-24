import { useState } from "react";
import { CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";

const GAME_KEYS = ["scatts", "lowNet", "ctp"];
const GAME_LABELS = { scatts: "Scatts / Skins", lowNet: "Low Net Tournament", ctp: "Closest to Pin" };

export default function GamesScreen({ event, saveEvent }) {
  const { players = [], courses = {}, games: savedGames = {} } = event;

  const [weekendBuyIn, setWeekendBuyIn] = useState(event.weekendBuyIn || 0);
  const [games, setGames] = useState(() => {
    const defaults = { scatts: { enabled: true, pot: 0 }, lowNet: { enabled: true, pot: 0, payoutPcts: [50, 30, 20] }, ctp: { enabled: true, pot: 0, holes: {}, results: {} } };
    const g = {};
    GAME_KEYS.forEach((k) => { g[k] = { ...defaults[k], ...(savedGames[k] || {}) }; });
    return g;
  });
  // optOuts: set of player IDs not participating in games
  const [optOuts, setOptOuts] = useState(() => new Set(event.optOuts || []));
  const [ctpRound, setCtpRound] = useState(1);

  const gamblingPlayers = players.filter((p) => !optOuts.has(p.id));
  const numPlayers = gamblingPlayers.length;
  const totalPot = numPlayers * (weekendBuyIn || 0);

  function toggleOptOut(pid) {
    setOptOuts((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      return next;
    });
  }
  const allocated = GAME_KEYS.filter((k) => games[k].enabled).reduce((s, k) => s + (Number(games[k].pot) || 0), 0);
  const remaining = totalPot - allocated;

  function updateGame(key, field, val) {
    setGames((g) => ({ ...g, [key]: { ...g[key], [field]: val } }));
  }

  function splitEqually() {
    const enabled = GAME_KEYS.filter((k) => games[k].enabled);
    if (!enabled.length || !totalPot) return;
    const share = Math.floor(totalPot / enabled.length);
    const next = { ...games };
    enabled.forEach((k, i) => { next[k] = { ...next[k], pot: share + (i === 0 ? totalPot - share * enabled.length : 0) }; });
    setGames(next);
  }

  function updatePayoutPct(idx, val) {
    const pcts = [...(games.lowNet.payoutPcts || [50, 30, 20])];
    pcts[idx] = Number(val) || 0;
    updateGame("lowNet", "payoutPcts", pcts);
  }

  function toggleCtpHole(roundNum, holeIdx) {
    const holes = { ...(games.ctp.holes || {}) };
    const rh = holes[roundNum] || [];
    holes[roundNum] = rh.includes(holeIdx) ? rh.filter((h) => h !== holeIdx) : [...rh, holeIdx];
    updateGame("ctp", "holes", holes);
  }

  function setCTPWinner(roundNum, holeIdx, pid) {
    const results = { ...(games.ctp.results || {}) };
    const rr = { ...(results[roundNum] || {}) };
    if (pid === "") delete rr[holeIdx]; else rr[holeIdx] = Number(pid);
    results[roundNum] = rr;
    updateGame("ctp", "results", results);
  }

  function save() {
    saveEvent({ ...event, weekendBuyIn, games, optOuts: [...optOuts] });
  }

  const pcts = games.lowNet.payoutPcts || [50, 30, 20];
  const pctSum = pcts.reduce((a, b) => a + (Number(b) || 0), 0);
  const ctpCourse = (() => { const r = event.rounds?.[ctpRound]; return r ? courses[r.courseId] : null; })();
  const par3Holes = ctpCourse ? ctpCourse.par.map((p, i) => ({ idx: i, par: p })).filter((h) => h.par === 3) : [];

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "18px" }}>
        Games & Pots
      </div>

      {/* Weekend buy-in */}
      <div className="card2" style={{ marginBottom: "16px" }}>
        <div className="card-header">Weekend Buy-In</div>
        <div style={{ padding: "16px 14px", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "14px", color: CREAM, fontWeight: 500 }}>Per player · entire weekend</div>
            {numPlayers > 0 && weekendBuyIn > 0 && (
              <div style={{ fontSize: "12px", color: M, marginTop: "2px" }}>
                {numPlayers} players · Total pot ${totalPot.toLocaleString()}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "16px", color: M }}>$</span>
            <input
              type="number"
              value={weekendBuyIn || ""}
              onChange={(e) => setWeekendBuyIn(Number(e.target.value) || 0)}
              placeholder="0"
              min="0"
              style={{
                width: "100px", padding: "10px 12px", textAlign: "right",
                borderRadius: "8px", border: `2px solid ${G}`,
                background: "#fff", color: CREAM,
                fontFamily: FB, fontSize: "20px", fontWeight: 700, outline: "none",
              }}
            />
          </div>
        </div>
      </div>

      {/* Players in */}
      {players.length > 0 && (
        <div className="card2" style={{ marginBottom: "16px" }}>
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Players In</span>
            <span style={{ color: M, fontWeight: 400 }}>{numPlayers} of {players.length} gambling</span>
          </div>
          {players.map((p) => {
            const isIn = !optOuts.has(p.id);
            return (
              <div key={p.id} onClick={() => toggleOptOut(p.id)}
                style={{ padding: "11px 14px", borderBottom: `1px solid #d0d8d0`, display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                <input type="checkbox" checked={isIn} onChange={() => toggleOptOut(p.id)}
                  style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: G }} />
                <div style={{ flex: 1, fontSize: "14px", color: isIn ? CREAM : M }}>{p.name}</div>
                {!isIn && <div style={{ fontSize: "11px", color: M, background: "#e8e8e4", padding: "2px 8px", borderRadius: "8px" }}>opt out</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Allocation */}
      <div className="card2" style={{ marginBottom: "16px" }}>
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Allocate to Games</span>
          <button onClick={splitEqually} className="btn-ghost" style={{ fontSize: "11px", padding: "3px 10px" }}>
            Split equally
          </button>
        </div>

        {GAME_KEYS.map((key) => {
          const g = games[key];
          return (
            <div key={key} style={{ padding: "12px 14px", borderBottom: `1px solid #d0d8d0`, display: "flex", alignItems: "center", gap: "12px" }}>
              <input type="checkbox" checked={g.enabled}
                onChange={(e) => updateGame(key, "enabled", e.target.checked)}
                style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: G }} />
              <div style={{ flex: 1, fontSize: "14px", color: g.enabled ? CREAM : M }}>
                {GAME_LABELS[key]}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "13px", color: M }}>$</span>
                <input
                  type="number"
                  value={g.pot || ""}
                  onChange={(e) => updateGame(key, "pot", Number(e.target.value) || 0)}
                  disabled={!g.enabled}
                  min="0"
                  placeholder="0"
                  style={{
                    width: "80px", padding: "7px 10px", textAlign: "right",
                    borderRadius: "7px", border: `1px solid #c8d0c8`,
                    background: g.enabled ? "#fff" : "transparent",
                    color: g.enabled ? CREAM : M,
                    fontFamily: FB, fontSize: "15px", fontWeight: 600, outline: "none",
                  }}
                />
              </div>
            </div>
          );
        })}

        <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
          <span style={{ color: M }}>
            {totalPot > 0 ? `$${totalPot.toLocaleString()} total` : "Set buy-in above"}
          </span>
          <span style={{ fontWeight: 700, color: remaining === 0 ? G : remaining < 0 ? R : M }}>
            {remaining === 0 && totalPot > 0
              ? "✓ Fully allocated"
              : remaining > 0
              ? `$${remaining.toLocaleString()} remaining`
              : `$${Math.abs(remaining).toLocaleString()} over`}
          </span>
        </div>
      </div>

      {/* Low Net payout split */}
      {games.lowNet.enabled && (
        <div className="card2" style={{ marginBottom: "16px" }}>
          <div className="card-header">Low Net Payout Split</div>
          <div style={{ padding: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "8px" }}>
              {["1st", "2nd", "3rd"].map((place, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "11px", color: M, marginBottom: "5px" }}>{place}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                    <input
                      type="number" value={pcts[i] ?? ""} min="0" max="100"
                      onChange={(e) => updatePayoutPct(i, e.target.value)}
                      style={{
                        width: "58px", padding: "8px 4px", textAlign: "center",
                        borderRadius: "7px", border: `1px solid #c8d0c8`,
                        background: "#fff", color: CREAM,
                        fontFamily: FB, fontSize: "16px", fontWeight: 700, outline: "none",
                      }}
                    />
                    <span style={{ color: M, fontSize: "13px" }}>%</span>
                  </div>
                  <div style={{ fontSize: "12px", color: GO, marginTop: "4px", fontWeight: 600 }}>
                    ${Math.round((games.lowNet.pot || 0) * (pcts[i] || 0) / 100).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center", fontSize: "12px", color: pctSum === 100 ? G : R, fontWeight: 600 }}>
              {pctSum === 100 ? "✓ 100%" : `${pctSum}% — must equal 100%`}
            </div>
          </div>
        </div>
      )}

      {/* CTP holes */}
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
              {ctpCourse ? "No par 3s on this course." : `Assign a course to Round ${ctpRound} first.`}
            </div>
          ) : par3Holes.map(({ idx }) => {
            const isSelected = (games.ctp.holes?.[ctpRound] || []).includes(idx);
            const winnerId = games.ctp.results?.[ctpRound]?.[idx];
            return (
              <div key={idx} style={{ padding: "10px 14px", borderBottom: `1px solid #d0d8d0`, display: "flex", alignItems: "center", gap: "12px" }}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleCtpHole(ctpRound, idx)}
                  style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: G }} />
                <div style={{ flex: 1, fontSize: "13px", color: isSelected ? CREAM : M }}>Hole {idx + 1} · Par 3</div>
                {isSelected && (
                  <select value={winnerId || ""} onChange={(e) => setCTPWinner(ctpRound, idx, e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: "7px", border: `1px solid #c8d0c8`, background: "#fff", color: winnerId ? CREAM : M, fontFamily: FB, fontSize: "13px", outline: "none", cursor: "pointer" }}>
                    <option value="">— Winner —</option>
                    {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button onClick={save} className="btn" style={{ width: "100%", padding: "13px", fontSize: "15px" }}>
        Save
      </button>
    </div>
  );
}
