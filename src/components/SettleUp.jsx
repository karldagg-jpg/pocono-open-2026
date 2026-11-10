import { useState } from "react";
import { CREAM, G, GO, GOLD, M, R, FB } from "../constants/theme";
import { paidSummary } from "../lib/payments";
import { describeGroup } from "../lib/signOff";

// Who pays whom, with a tick when it's done. While any card is still unsigned
// the amounts are provisional and say so.
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
          {waiting && <Provisional signOff={signOff} />}

          {plan.map((p) => (
            <div key={p.key} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 11px", borderRadius: "10px", background: p.paid ? "rgba(26,107,58,.07)" : "#fff", border: "1px solid #d8ddd8" }}>
              {onTogglePaid && (
                <input type="checkbox" checked={p.paid} onChange={(e) => onTogglePaid(p, e.target.checked)}
                  aria-label={`${p.from} paid ${p.to} $${p.amount}`}
                  style={{ width: "20px", height: "20px", accentColor: G, cursor: "pointer" }} />
              )}
              <div style={{ flex: 1, minWidth: 0, fontSize: "14px", color: CREAM, textDecoration: p.paid ? "line-through" : "none", opacity: p.paid ? 0.6 : 1 }}>
                <strong>{p.from}</strong> <span style={{ color: M }}>pays</span> <strong>{p.to}</strong>
              </div>
              <span style={{ fontWeight: 800, fontSize: "15px", fontVariantNumeric: "tabular-nums", color: GO }}>${p.amount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Provisional({ signOff }) {
  return (
    <div role="status" style={{ fontSize: "13px", color: R, background: "rgba(176,32,32,.06)", padding: "9px 11px", borderRadius: "9px", lineHeight: 1.45 }}>
      <strong>Provisional.</strong> These amounts can still change — not every card is signed:
      <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
        {signOff.pending.map((g) => <li key={`${g.roundId}-${g.key}`}>{describeGroup(g)}{g.stale ? " (changed since signing)" : ""}</li>)}
      </ul>
    </div>
  );
}
