import { useState } from "react";
import { CREAM, G, GO, GOLD, M, R, FB } from "../constants/theme";
import { paidSummary } from "../lib/venmo";
import { describeGroup } from "../lib/signOff";

// Who pays whom, with a Pay button for each line and a tick when it's done.
//
// The button shows the username it pays, and Venmo shows the person's name and
// photo before anything is sent — two chances to catch a wrong username. While
// any card is still unsigned the amounts are provisional and the buttons wait.
export default function SettleUp({ plan, signOff, archived = false, onTogglePaid = null }) {
  const [open, setOpen] = useState(!archived);
  if (!plan.length) return null;
  const sum = paidSummary(plan);
  const waiting = signOff && !signOff.settled;

  return (
    <div style={{ padding: "10px 14px" }}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        style={{ border: "none", background: "transparent", color: GOLD, fontFamily: FB, fontSize: "14px", fontWeight: 700, cursor: "pointer", padding: 0 }}>
        {open ? "Hide" : "Show"} who pays whom · {sum.done} of {sum.total} paid
      </button>

      {open && (
        <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
          {waiting && (
            <div role="status" style={{ fontSize: "13px", color: R, background: "rgba(176,32,32,.06)", padding: "9px 11px", borderRadius: "9px", lineHeight: 1.45 }}>
              <strong>Provisional.</strong> These amounts can still change — not every card is signed:
              <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
                {signOff.pending.map((g) => <li key={`${g.roundId}-${g.key}`}>{describeGroup(g)}{g.stale ? " (changed since signing)" : ""}</li>)}
              </ul>
            </div>
          )}

          {plan.map((p) => (
            <div key={p.key} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 11px", borderRadius: "10px", background: p.paid ? "rgba(26,107,58,.07)" : "#fff", border: "1px solid #d8ddd8" }}>
              <label style={{ display: "flex", alignItems: "center", cursor: onTogglePaid ? "pointer" : "default" }}>
                <input type="checkbox" checked={p.paid} disabled={!onTogglePaid}
                  onChange={(e) => onTogglePaid && onTogglePaid(p, e.target.checked)}
                  aria-label={`${p.from} paid ${p.to} $${p.amount}`}
                  style={{ width: "20px", height: "20px", accentColor: G, cursor: "inherit" }} />
              </label>
              <div style={{ flex: 1, minWidth: 0, fontSize: "14px", color: CREAM, textDecoration: p.paid ? "line-through" : "none", opacity: p.paid ? 0.6 : 1 }}>
                <strong>{p.from}</strong> <span style={{ color: M }}>pays</span> <strong>{p.to}</strong>
              </div>
              <span style={{ fontWeight: 800, fontSize: "15px", fontVariantNumeric: "tabular-nums", color: GO }}>${p.amount}</span>
              {!archived && !p.paid && (
                p.link && !waiting ? (
                  <a href={p.link} target="_blank" rel="noopener noreferrer"
                    style={{ padding: "7px 11px", borderRadius: "8px", background: "#3d95ce", color: "#fff", fontSize: "13px", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
                    Pay @{p.handle}
                  </a>
                ) : p.link ? (
                  <span style={{ fontSize: "12px", color: M, whiteSpace: "nowrap" }}>@{p.handle}</span>
                ) : (
                  <span style={{ fontSize: "12px", color: M, whiteSpace: "nowrap" }}>No Venmo</span>
                )
              )}
            </div>
          ))}

          {!archived && plan.some((p) => !p.handle) && (
            <div style={{ fontSize: "12px", color: M }}>Add Venmo usernames on Players and a Pay button appears for each.</div>
          )}
        </div>
      )}
    </div>
  );
}
