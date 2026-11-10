import { useState } from "react";
import { CREAM, G, GO, GOLD, M, FB } from "../constants/theme";
import { Provisional } from "./SettleUp";

const money = (n) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

// Settling up when one person holds the money: one line per player, what the
// bank pays them or collects from them. Everyone sees the amounts; only the
// bank can tick lines off as they're settled.
export default function BankSettle({ plan, signOff, archived = false, onToggle = null }) {
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

          {waiting && <Provisional signOff={signOff} />}

          {plan.lines.map((l) => (
            <div key={l.key} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 11px", borderRadius: "10px", border: "1px solid #d8ddd8", background: l.done ? "rgba(26,107,58,.07)" : "#fff" }}>
              {onToggle && l.kind !== "square" && (
                <input type="checkbox" checked={l.done} onChange={(e) => onToggle(l, e.target.checked)}
                  aria-label={`${l.kind === "pay" ? "Paid" : "Collected from"} ${l.player.name}`}
                  style={{ width: "20px", height: "20px", accentColor: G, cursor: "pointer" }} />
              )}
              <div style={{ flex: 1, minWidth: 0, fontSize: "14px", color: CREAM, textDecoration: l.done ? "line-through" : "none", opacity: l.done ? 0.6 : 1 }}>
                {l.kind === "pay" ? <><strong>{bank}</strong> <span style={{ color: M }}>pays</span> <strong>{l.player.name}</strong></>
                  : l.kind === "request" ? <><strong>{l.player.name}</strong> <span style={{ color: M }}>pays</span> <strong>{bank}</strong></>
                  : <><strong>{l.player.name}</strong> <span style={{ color: M }}>is square</span></>}
              </div>
              {l.kind !== "square" && <span style={{ fontWeight: 800, fontSize: "15px", fontVariantNumeric: "tabular-nums", color: l.kind === "pay" ? G : GO }}>{money(l.amount)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
