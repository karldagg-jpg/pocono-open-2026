import { useState } from "react";
import { BG, CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";

export default function SetupScreen({ event, saveEvent }) {
  const players = event.players || [];
  const [name, setName] = useState("");
  const [hcpIndex, setHcpIndex] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editHcp, setEditHcp] = useState("");

  function addPlayer() {
    if (!name.trim() || hcpIndex === "") return;
    const newPlayer = {
      id: Date.now(),
      name: name.trim(),
      hcpIndex: parseFloat(hcpIndex),
    };
    saveEvent({ ...event, players: [...players, newPlayer] });
    setName("");
    setHcpIndex("");
  }

  function removePlayer(id) {
    saveEvent({ ...event, players: players.filter((p) => p.id !== id) });
  }

  function startEdit(p) {
    setEditId(p.id);
    setEditName(p.name);
    setEditHcp(String(p.hcpIndex));
  }

  function saveEdit() {
    saveEvent({
      ...event,
      players: players.map((p) =>
        p.id === editId ? { ...p, name: editName.trim(), hcpIndex: parseFloat(editHcp) } : p
      ),
    });
    setEditId(null);
  }

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        Players
      </div>
      <div style={{ color: M, fontSize: "14px", marginBottom: "22px" }}>
        {players.length}/12 players · USGA handicap indexes
      </div>

      {/* Add player form */}
      {players.length < 12 && (
        <div style={{ background: CARD2, border: `1px solid ${GOLD}22`, borderRadius: "12px", padding: "14px", marginBottom: "18px" }}>
          <div style={{ fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, marginBottom: "10px" }}>
            Add Player
          </div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlayer()}
              placeholder="Player name"
              style={inputStyle}
            />
            <input
              value={hcpIndex}
              onChange={(e) => setHcpIndex(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlayer()}
              placeholder="HCP Index"
              type="number"
              step="0.1"
              min="0"
              max="54"
              style={{ ...inputStyle, width: "100px", flexShrink: 0 }}
            />
          </div>
          <button onClick={addPlayer} style={btnStyle}>
            + Add
          </button>
        </div>
      )}

      {/* Player list */}
      <div style={{ display: "grid", gap: "6px" }}>
        {players.map((p, i) => (
          <div key={p.id} style={{ background: CARD, border: `1px solid ${GOLD}22`, borderRadius: "10px", padding: "10px 14px" }}>
            {editId === p.id ? (
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <input value={editHcp} onChange={(e) => setEditHcp(e.target.value)} type="number" step="0.1" style={{ ...inputStyle, width: "80px" }} />
                <button onClick={saveEdit} style={{ ...btnStyle, padding: "6px 12px" }}>Save</button>
                <button onClick={() => setEditId(null)} style={{ ...ghostBtn, padding: "6px 12px" }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: G + "22", border: `1px solid ${G}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: G, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "14px", color: CREAM, fontWeight: 500 }}>{p.name}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: GOLD }}>{p.hcpIndex.toFixed(1)}</div>
                  <div style={{ fontSize: "10px", color: M }}>index</div>
                </div>
                <button onClick={() => startEdit(p)} style={{ ...ghostBtn, fontSize: "12px", padding: "4px 10px" }}>Edit</button>
                <button onClick={() => removePlayer(p.id)} style={{ ...ghostBtn, fontSize: "12px", padding: "4px 10px", color: R, borderColor: R + "44" }}>✕</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {players.length === 0 && (
        <div style={{ textAlign: "center", color: M, fontSize: "14px", padding: "40px 0" }}>
          No players yet. Add up to 12 above.
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  flex: 1,
  padding: "9px 12px",
  borderRadius: "8px",
  border: "1px solid rgba(201,168,76,0.2)",
  background: "rgba(26,61,36,0.15)",
  color: "#f0ece0",
  fontSize: "14px",
  fontFamily: "'Inter','Helvetica Neue',sans-serif",
  outline: "none",
};

const btnStyle = {
  padding: "9px 18px",
  borderRadius: "8px",
  border: "none",
  background: "#1a6b3a",
  color: "#f0ece0",
  fontFamily: "'Inter','Helvetica Neue',sans-serif",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: "0.04em",
};

const ghostBtn = {
  padding: "6px 14px",
  borderRadius: "7px",
  border: "1px solid rgba(201,168,76,0.3)",
  background: "transparent",
  color: "#8a9e8c",
  fontFamily: "'Inter','Helvetica Neue',sans-serif",
  fontSize: "13px",
  cursor: "pointer",
};
