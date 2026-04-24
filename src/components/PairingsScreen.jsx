import { useState } from "react";
import { CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { autoPairRound3 } from "../lib/golfLogic";

export default function PairingsScreen({ event, saveEvent }) {
  const players = event.players || [];
  const pairings = event.pairings || {};
  const [activeRound, setActiveRound] = useState(1);
  const groups = pairings[activeRound] || [[], [], []];

  // All player ids not yet assigned in this round
  const assigned = new Set(groups.flat());
  const unassigned = players.filter((p) => !assigned.has(p.id));

  function assignToGroup(pid, groupIdx) {
    const next = groups.map((g) => g.filter((id) => id !== pid));
    if (groupIdx !== null) next[groupIdx] = [...next[groupIdx], pid];
    saveEvent({ ...event, pairings: { ...pairings, [activeRound]: next } });
  }

  function autoFill() {
    const auto = autoPairRound3(event);
    saveEvent({ ...event, pairings: { ...pairings, [activeRound]: auto } });
  }

  function playerName(id) {
    return players.find((p) => p.id === id)?.name || "?";
  }

  function playerHcp(id) {
    return players.find((p) => p.id === id)?.hcpIndex?.toFixed(1) || "";
  }

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        Pairings
      </div>
      <div style={{ color: M, fontSize: "14px", marginBottom: "18px" }}>
        Assign foursomes per round · Round 3 auto-pairs by standings
      </div>

      {/* Round tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "18px" }}>
        {[1, 2, 3].map((r) => (
          <button
            key={r}
            onClick={() => setActiveRound(r)}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: "10px",
              border: `1px solid ${activeRound === r ? G : GOLD + "33"}`,
              background: activeRound === r ? G + "22" : "transparent",
              color: activeRound === r ? CREAM : M,
              fontFamily: FB,
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Round {r}
          </button>
        ))}
      </div>

      {/* Auto-pair button for round 3 */}
      {activeRound === 3 && (
        <button onClick={autoFill} style={{ ...btnStyle, marginBottom: "16px", background: GO }}>
          Auto-pair by standings
        </button>
      )}

      {/* Groups */}
      <div style={{ display: "grid", gap: "10px", marginBottom: "18px" }}>
        {[0, 1, 2].map((gi) => (
          <div key={gi} style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", padding: "14px" }}>
            <div style={{ fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: "10px" }}>
              Group {gi + 1}
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              {groups[gi].length === 0 && (
                <div style={{ fontSize: "13px", color: M, padding: "6px 0" }}>Empty — tap a player below to assign</div>
              )}
              {groups[gi].map((pid) => (
                <div key={pid} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", background: G + "15", borderRadius: "8px", border: `1px solid ${G}33` }}>
                  <span style={{ flex: 1, fontSize: "14px", color: CREAM }}>{playerName(pid)}</span>
                  <span style={{ fontSize: "12px", color: GOLD }}>{playerHcp(pid)}</span>
                  <button onClick={() => assignToGroup(pid, null)} style={{ ...removeBtn }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Unassigned pool */}
      {unassigned.length > 0 && (
        <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", padding: "14px" }}>
          <div style={{ fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: "10px" }}>
            Unassigned ({unassigned.length})
          </div>
          <div style={{ display: "grid", gap: "6px" }}>
            {unassigned.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ flex: 1, fontSize: "14px", color: M }}>{p.name} <span style={{ color: GOLD, fontSize: "12px" }}>{p.hcpIndex.toFixed(1)}</span></div>
                {[0, 1, 2].map((gi) => (
                  <button
                    key={gi}
                    onClick={() => assignToGroup(p.id, gi)}
                    disabled={groups[gi].length >= 4}
                    style={{
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: `1px solid ${G}55`,
                      background: groups[gi].length >= 4 ? "transparent" : G + "22",
                      color: groups[gi].length >= 4 ? M : CREAM,
                      fontSize: "12px",
                      cursor: groups[gi].length >= 4 ? "default" : "pointer",
                      fontFamily: FB,
                    }}
                  >
                    G{gi + 1}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  padding: "10px 18px",
  borderRadius: "8px",
  border: "none",
  background: G,
  color: CREAM,
  fontFamily: FB,
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
};

const removeBtn = {
  padding: "3px 8px",
  borderRadius: "5px",
  border: `1px solid ${R}4d`,
  background: "transparent",
  color: R,
  fontSize: "12px",
  cursor: "pointer",
};
