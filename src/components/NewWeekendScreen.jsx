import { useState } from "react";
import { CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { describeClone } from "../lib/newWeekend";

// Setting up a weekend used to be three browser prompts in a row, which gave
// you no way back and no sight of what you were agreeing to. This shows the
// whole decision at once: what carries, what doesn't, and how big the field is
// going to be — because the field size is what the pots have to match.
export default function NewWeekendScreen({ source, sourceLabel, onCreate, onCancel }) {
  const [label, setLabel] = useState("");
  const [rounds, setRounds] = useState(3);
  const [expected, setExpected] = useState(16);
  const [keepPlayers, setKeepPlayers] = useState(true);
  const [keepGames, setKeepGames] = useState(true);
  const [resetIndexes, setResetIndexes] = useState(false);

  const hasSource = (source?.players || []).length > 0;
  const plan = hasSource
    ? describeClone(source, { label: label || "New weekend", roundCount: rounds, keepPlayers, keepGames, resetIndexes })
    : null;

  const carried = plan && keepPlayers ? plan.players : 0;
  const toAdd = Math.max(0, expected - carried);

  const lbl = { fontSize: "11px", letterSpacing: ".08em", textTransform: "uppercase", color: M, fontWeight: 700 };
  const input = {
    padding: "10px 12px", borderRadius: "9px", border: "1px solid #c8d0c8",
    background: "#fff", color: CREAM, fontFamily: FB, fontSize: "15px", outline: "none", width: "100%",
  };
  const row = { display: "flex", alignItems: "center", gap: "9px", padding: "8px 0" };

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "26px", fontWeight: 700, color: CREAM, marginBottom: "3px" }}>
        New weekend
      </div>
      <p style={{ fontSize: "13px", color: M, margin: "0 0 18px" }}>
        {hasSource ? <>Starting from <strong style={{ color: CREAM }}>{sourceLabel || source.name}</strong>.</> : "Starting from scratch."}
      </p>

      <div style={{ background: CARD2, borderRadius: "12px", padding: "15px", marginBottom: "14px" }}>
        <div style={{ ...lbl, marginBottom: "7px" }}>Name</div>
        <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)}
          placeholder="Pinehurst 2027" style={input} />

        <div style={{ display: "flex", gap: "12px", marginTop: "15px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...lbl, marginBottom: "7px" }}>Rounds</div>
            <input type="number" min="1" max="6" value={rounds}
              onChange={(e) => setRounds(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
              inputMode="numeric" style={input} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...lbl, marginBottom: "7px" }}>Players expected</div>
            <input type="number" min="2" max="60" value={expected}
              onChange={(e) => setExpected(Math.max(2, Math.min(60, Number(e.target.value) || 2)))}
              inputMode="numeric" style={input} />
          </div>
        </div>
      </div>

      {hasSource && (
        <div style={{ background: CARD2, borderRadius: "12px", padding: "15px", marginBottom: "14px" }}>
          <div style={{ ...lbl, marginBottom: "4px" }}>Carry over</div>

          <label style={{ ...row, cursor: "pointer" }}>
            <input type="checkbox" checked={keepPlayers} onChange={(e) => setKeepPlayers(e.target.checked)} />
            <span style={{ flex: 1, fontSize: "14px", color: CREAM }}>
              The field
              <span style={{ color: M, fontSize: "12px" }}> · {plan.players} players with their indexes</span>
            </span>
          </label>

          {keepPlayers && (
            <label style={{ ...row, cursor: "pointer", paddingLeft: "24px" }}>
              <input type="checkbox" checked={resetIndexes} onChange={(e) => setResetIndexes(e.target.checked)} />
              <span style={{ flex: 1, fontSize: "13px", color: M }}>
                Wipe their indexes and reassess
              </span>
            </label>
          )}

          <label style={{ ...row, cursor: "pointer" }}>
            <input type="checkbox" checked={keepGames} onChange={(e) => setKeepGames(e.target.checked)} />
            <span style={{ flex: 1, fontSize: "14px", color: CREAM }}>
              Games and buy-in
              <span style={{ color: M, fontSize: "12px" }}> · {plan.gamesEnabled.join(", ") || "none"} · ${plan.buyIn}/player</span>
            </span>
          </label>

          {plan.leavesBehind.length > 0 && (
            <div style={{ fontSize: "12px", color: M, marginTop: "10px", paddingTop: "10px", borderTop: "1px solid rgba(0,0,0,.07)" }}>
              Staying with {sourceLabel || source.name}: {plan.leavesBehind.join(", ")}.
              {plan.leavesBehind.includes("courses") && " A new venue means new courses."}
            </div>
          )}
        </div>
      )}

      {/* What you'll still have to do — said now, not discovered in May. */}
      <div style={{ background: `${GO}0e`, border: `1px solid ${GO}44`, borderRadius: "12px", padding: "13px 15px", marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", fontWeight: 700, color: GO, marginBottom: "6px" }}>Still to do after this</div>
        <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: CREAM, lineHeight: 1.6 }}>
          {toAdd > 0 && <li>Add {toAdd} more player{toAdd === 1 ? "" : "s"} to reach {expected}</li>}
          {carried > expected && <li>Remove {carried - expected} to get down to {expected}</li>}
          <li>Add the courses and set one per round</li>
          {keepGames && plan && <li>Resize the pots for {expected} players — ${plan.buyIn} × {expected} = ${plan.buyIn * expected}</li>}
          <li>Pair the groups</li>
        </ul>
        <div style={{ fontSize: "12px", color: M, marginTop: "8px" }}>
          The Players tab tracks all of this and won't say ready until it's done.
        </div>
      </div>

      <div style={{ display: "flex", gap: "9px" }}>
        <button onClick={onCancel}
          style={{ padding: "11px 16px", borderRadius: "9px", border: "1px solid #c8d0c8", background: "transparent", color: M, fontFamily: FB, fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
          Cancel
        </button>
        <button
          disabled={!label.trim()}
          onClick={() => onCreate({ label: label.trim(), roundCount: rounds, keepPlayers, keepGames, resetIndexes, expectedPlayers: expected })}
          style={{
            flex: 1, padding: "11px 16px", borderRadius: "9px", border: "none",
            background: label.trim() ? G : "#c8d0c8", color: "#fff",
            fontFamily: FB, fontSize: "14px", fontWeight: 700,
            cursor: label.trim() ? "pointer" : "not-allowed",
          }}>
          Create {label.trim() || "weekend"}
        </button>
      </div>
    </div>
  );
}
