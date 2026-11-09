import { useEffect, useMemo, useState } from "react";
import { CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { fetchWeekends } from "../firebase/client";
import { playedWeekends, careerTable, weekendWinners, headToHead } from "../lib/allTime";

const money = (n) => (n === 0 ? "$0" : `${n < 0 ? "−" : "+"}$${Math.abs(n).toLocaleString()}`);

// The trip's history: who's won, who's up over the years, the best rounds, and
// how any two players compare on the rounds they both played.
export default function RecordScreen({ event, library = {}, weekendIndex = {}, weekendId = null, others: othersProp = null }) {
  const [others, setOthers] = useState(othersProp || []);
  const otherKey = Object.keys(weekendIndex).filter((id) => id !== weekendId).join();
  useEffect(() => {
    if (othersProp) return;
    const ids = otherKey ? otherKey.split(",") : [];
    if (!ids.length) return;
    let live = true;
    fetchWeekends(ids).then((ws) => { if (live) setOthers(ws); });
    return () => { live = false; };
  }, [otherKey, othersProp]);

  const weekends = useMemo(() => {
    const label = (id) => weekendIndex[id]?.label || id;
    const all = [
      ...(weekendId ? [{ id: weekendId, label: label(weekendId), event }] : []),
      ...others.map((w) => ({ ...w, label: w.label || label(w.id) })),
    ];
    return playedWeekends(all, library);
  }, [event, others, weekendId, weekendIndex, library]);

  const table = useMemo(() => careerTable(weekends), [weekends]);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const pa = a || table[0]?.key || "";
  const pb = b || table[1]?.key || "";
  const h2h = useMemo(() => (pa && pb && pa !== pb ? headToHead(weekends, pa, pb) : null), [weekends, pa, pb]);
  const nameOf = (k) => table.find((r) => r.key === k)?.name || "?";

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto", padding: "22px 16px 40px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>Record</div>
      <div style={{ color: M, fontSize: "14px", marginBottom: "18px" }}>
        {weekends.length === 0 ? "Nothing played yet — the record starts with the first full card." : `${weekends.length} weekend${weekends.length === 1 ? "" : "s"} so far.`}
      </div>

      {weekends.length > 0 && (
        <>
          <Label>Winners</Label>
          <div style={{ display: "grid", gap: "8px", margin: "8px 0 24px" }}>
            {[...weekends].reverse().map((w) => {
              const win = weekendWinners(w);
              return (
                <div key={w.id} style={{ display: "flex", alignItems: "center", gap: "12px", background: CARD, border: "1px solid #d8ddd8", borderRadius: "12px", padding: "12px 14px" }}>
                  <span aria-hidden style={{ fontSize: "22px" }}>🏆</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", color: M }}>{w.label}</div>
                    <div style={{ fontSize: "17px", fontWeight: 700, color: CREAM }}>{win.names.length ? win.names.join(" & ") : "No finisher"}</div>
                  </div>
                  {win.total != null && <div style={{ fontSize: "15px", fontWeight: 700, color: GO, fontVariantNumeric: "tabular-nums" }}>{win.total} net</div>}
                </div>
              );
            })}
          </div>

          <Label>All-time money</Label>
          <div style={{ background: CARD, border: "1px solid #d8ddd8", borderRadius: "12px", margin: "8px 0 24px", overflow: "hidden" }}>
            {table.map((r, i) => (
              <div key={r.key} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderTop: i ? "1px solid #eef0eb" : "none" }}>
                <div style={{ width: "22px", fontSize: "13px", fontWeight: 700, color: GOLD, fontVariantNumeric: "tabular-nums" }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: CREAM }}>
                    {r.name}{r.wins > 0 && <span style={{ color: GO }} aria-label={`${r.wins} win${r.wins === 1 ? "" : "s"}`}> {"🏆".repeat(Math.min(r.wins, 5))}</span>}
                  </div>
                  <div style={{ fontSize: "12px", color: M, fontVariantNumeric: "tabular-nums" }}>
                    {r.weekends} weekend{r.weekends === 1 ? "" : "s"} · {r.rounds} rounds
                    {r.bestGross && <> · best {r.bestGross.score}</>}
                    {r.birdies > 0 && <> · {r.birdies} birdie{r.birdies === 1 ? "" : "s"}</>}
                    {r.eagles > 0 && <> · {r.eagles} eagle{r.eagles === 1 ? "" : "s"}</>}
                  </div>
                </div>
                <div style={{ fontSize: "16px", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: r.net > 0 ? G : r.net < 0 ? R : M }}>{money(r.net)}</div>
              </div>
            ))}
          </div>

          {table.length > 1 && (
            <>
              <Label>Head to head</Label>
              <div style={{ background: CARD2, borderRadius: "12px", padding: "14px", marginTop: "8px" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <PlayerSelect value={pa} onChange={setA} table={table} label="First player" />
                  <span style={{ color: M, fontSize: "13px" }}>v</span>
                  <PlayerSelect value={pb} onChange={setB} table={table} label="Second player" />
                </div>
                {h2h && (
                  h2h.rounds === 0 ? (
                    <div style={{ fontSize: "14px", color: M, marginTop: "12px" }}>They haven't finished a round on the same day yet.</div>
                  ) : (
                    <div style={{ marginTop: "12px" }}>
                      <div style={{ fontSize: "22px", fontWeight: 800, color: CREAM, fontVariantNumeric: "tabular-nums" }}>
                        {nameOf(pa)} {h2h.aWins} – {h2h.bWins} {nameOf(pb)}
                      </div>
                      <div style={{ fontSize: "13px", color: M, marginTop: "3px" }}>
                        {h2h.rounds} round{h2h.rounds === 1 ? "" : "s"} on net{h2h.halved ? ` · ${h2h.halved} halved` : ""}
                        {h2h.strokes !== 0 && ` · ${h2h.strokes < 0 ? nameOf(pa) : nameOf(pb)} ${Math.abs(h2h.strokes)} shot${Math.abs(h2h.strokes) === 1 ? "" : "s"} better overall`}
                      </div>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function PlayerSelect({ value, onChange, table, label }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
      style={{ flex: 1, minWidth: 0, padding: "10px", borderRadius: "9px", border: "1px solid #c8d0c8", background: "#fff", fontFamily: FB, fontSize: "15px", color: CREAM }}>
      {table.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
    </select>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: "11px", color: M, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>{children}</div>;
}
