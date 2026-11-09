import { useState } from "react";
import { CREAM, G, GO, GOLD, M, R, FB } from "../constants/theme";
import { describeGroup } from "../lib/signOff";

const money = (n) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

// Settling up when one person holds the money. Everyone sees what they're owed
// or owe; only the bank (signed in) sees the Pay and Request buttons and can
// tick lines off — the buttons open Venmo on the bank's own phone.
export default function BankSettle({ plan, signOff, archived = false, canAct = false, onToggle = null }) {
  const [open, setOpen] = useState(!archived);
  if (!plan.banker || !plan.lines.length) return null;
  const waiting = signOff && !signOff.settled;
  const bank = plan.banker.name;

  return (
    <div style={{ padding: "10px 14px" }}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        style={{ border: "none", background: "transparent", color: GOLD, fontFamily: FB, fontSize: "14px", fontWeight: 700, cursor: "pointer", padding: 0 }}>
        {open ? "Hide" : "Show"} settling up with {bank} · {plan.done} of {plan.toDo} done
      </button>

      {open && (
        <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
          <div style={{ fontSize: "13px", color: M, lineHeight: 1.5 }}>
            {bank} holds the {money(plan.totals.collected)} in buy-ins: pays out {money(plan.totals.payOut)}
            {plan.totals.collect > 0 && <>, collects {money(plan.totals.collect)}</>}, and is left with {money(plan.totals.keeps)}.
          </div>

          {waiting && (
            <div role="status" style={{ fontSize: "13px", color: R, background: "rgba(176,32,32,.06)", padding: "9px 11px", borderRadius: "9px", lineHeight: 1.45 }}>
              <strong>Provisional.</strong> These amounts can still change — not every card is signed:
              <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
                {signOff.pending.map((g) => <li key={`${g.roundId}-${g.key}`}>{describeGroup(g)}{g.stale ? " (changed since signing)" : ""}</li>)}
              </ul>
            </div>
          )}

          {plan.lines.map((l) => (
            <div key={l.key} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 11px", borderRadius: "10px", border: "1px solid #d8ddd8", background: l.done ? "rgba(26,107,58,.07)" : "#fff" }}>
              {canAct && l.kind !== "square" && (
                <input type="checkbox" checked={l.done} onChange={(e) => onToggle && onToggle(l, e.target.checked)}
                  aria-label={`${l.kind === "pay" ? "Paid" : "Collected from"} ${l.player.name}`}
                  style={{ width: "20px", height: "20px", accentColor: G }} />
              )}
              <div style={{ flex: 1, minWidth: 0, fontSize: "14px", color: CREAM, textDecoration: l.done ? "line-through" : "none", opacity: l.done ? 0.6 : 1 }}>
                {l.kind === "pay" ? <><strong>{bank}</strong> <span style={{ color: M }}>pays</span> <strong>{l.player.name}</strong></>
                  : l.kind === "request" ? <><strong>{l.player.name}</strong> <span style={{ color: M }}>pays</span> <strong>{bank}</strong></>
                  : <><strong>{l.player.name}</strong> <span style={{ color: M }}>is square</span></>}
              </div>
              {l.kind !== "square" && <span style={{ fontWeight: 800, fontSize: "15px", fontVariantNumeric: "tabular-nums", color: l.kind === "pay" ? G : GO }}>{money(l.amount)}</span>}
              {canAct && !archived && !l.done && l.kind !== "square" && (
                l.link && !waiting ? (
                  <a href={l.link} target="_blank" rel="noopener noreferrer"
                    style={{ padding: "7px 11px", borderRadius: "8px", background: l.kind === "pay" ? "#3d95ce" : "#fff", color: l.kind === "pay" ? "#fff" : "#3d95ce", border: "1px solid #3d95ce", fontSize: "13px", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
                    {l.kind === "pay" ? "Pay" : "Request"} @{l.handle}
                  </a>
                ) : (
                  <span style={{ fontSize: "12px", color: M, whiteSpace: "nowrap" }}>{l.link ? `@${l.handle}` : "No Venmo"}</span>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
