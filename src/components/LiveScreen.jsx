import { useEffect, useMemo, useRef, useState } from "react";
import { liveRound, liveWeekend, positionDelta } from "../lib/liveBoard";
import { totalPar } from "../lib/golfLogic";

// Broadcast-style board. Deliberately dark and self-contained rather than using
// the app's light theme — it's meant to be readable across a room or one-handed
// in a cart, so it carries its own palette and doesn't inherit page chrome.
const INK = "#fff";
const BOARD = "#0d2317";
const BAR = "#08180f";
const LINE = "rgba(255,255,255,.055)";
const MUTED = "#9fc4ad";
const DIM = "#6d9481";
const GOLDL = "#c6a44e";
const UNDER = "#5fd493";
const OVER = "#f0a0a0";
const HILITE = "rgba(31,122,72,.22)";
// Alternating bands are what make this read as a green board rather than a
// black one — on a flat ground the club green disappears into near-black.
const BAND = "rgba(31,122,72,.10)";

const fmtToPar = (n) => (n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`);
const scoreColor = (n) => (n < 0 ? UNDER : n === 0 ? INK : OVER);

export default function LiveScreen({ event, library, meId: meIdProp, weekendLabel }) {
  // The app has no sign-in, so the board asks once who's looking and remembers
  // it. Without this the "your row" highlight could never fire.
  const [pickedMe, setPickedMe] = useState(() => {
    try { const v = localStorage.getItem("pocono:meId"); return v ? Number(v) : null; } catch { return null; }
  });
  const meId = meIdProp ?? pickedMe;
  function pickMe(v) {
    const id = v ? Number(v) : null;
    setPickedMe(id);
    try { id ? localStorage.setItem("pocono:meId", String(id)) : localStorage.removeItem("pocono:meId"); } catch {}
  }

  // The stored event doc has no name field, so fall back to the index label.
  const title = event.name || weekendLabel || "Leaderboard";
  const courses = useMemo(() => ({ ...(event.courses || {}), ...library }), [event.courses, library]);
  const ev = useMemo(() => ({ ...event, courses }), [event, courses]);

  const roundIds = useMemo(
    () => Object.keys(ev.rounds || {}).sort((a, b) => Number(a) - Number(b)),
    [ev.rounds]
  );

  // Default to the round actually being played, else the last one with scores.
  const liveRoundId = useMemo(() => {
    let last = roundIds[0];
    for (const id of roundIds) {
      const lb = liveRound(ev, id);
      if (!lb) continue;
      if (lb.playersStarted > 0) last = id;
      if (lb.anyInProgress) return id;
    }
    return last;
  }, [ev, roundIds]);

  const [view, setView] = useState("today");   // today | weekend | gross
  const [roundId, setRoundId] = useState(liveRoundId);
  useEffect(() => { setRoundId(liveRoundId); }, [liveRoundId]);

  const round = useMemo(() => liveRound(ev, roundId), [ev, roundId]);
  const weekend = useMemo(() => liveWeekend(ev), [ev]);

  const rows = useMemo(() => {
    if (view === "weekend") return weekend.rows;
    if (!round) return [];
    if (view !== "gross") return round.rows;
    // Gross view: same field, ranked on raw strokes rather than net.
    return [...round.rows]
      .sort((a, b) => {
        if (a.started !== b.started) return a.started ? -1 : 1;
        return a.toPar - b.toPar || b.thru - a.thru;
      })
      .map((r, i) => ({ ...r, position: r.started ? i + 1 : null }));
  }, [view, round, weekend]);

  // Movement arrows: compare against the positions from the previous update.
  const prevRef = useRef([]);
  const [delta, setDelta] = useState({});
  useEffect(() => {
    setDelta(positionDelta(prevRef.current, rows));
    prevRef.current = rows;
  }, [rows]);

  if (!roundIds.length) {
    return <Empty>No rounds set up yet. Add one on the Courses tab.</Empty>;
  }
  if (view !== "weekend" && !round) {
    return <Empty>Round {roundId} has no course assigned yet.</Empty>;
  }

  const anyLive = round?.anyInProgress;
  const par = round?.course ? totalPar(round.course) : null;
  const scoreOf = (r) => (view === "gross" ? r.toPar : r.netToPar);

  return (
    <div style={{ background: BOARD, color: INK, borderRadius: "14px", overflow: "hidden", maxWidth: "760px", margin: "0 auto" }}>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: BAR, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 800, letterSpacing: ".12em" }}>
          <span style={{
            width: "8px", height: "8px", borderRadius: "50%",
            background: anyLive ? "#ff5b52" : DIM,
            animation: anyLive ? "poPulse 1.8s infinite" : "none",
          }} />
          {anyLive ? "LIVE" : "BOARD"}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: "12px", lineHeight: 1.35, color: MUTED, textAlign: "right", overflowWrap: "anywhere" }}>
          {title}{view === "weekend" ? " · All rounds" : ` · Round ${roundId}`}
          {view !== "weekend" && round?.course && (
            <><br />{round.course.name} · Par {par}</>
          )}
        </div>
      </div>

      <div style={{ display: "flex", padding: "9px 14px 0", gap: "6px" }}>
        {[["today", "Today"], ["weekend", "Weekend"], ["gross", "Gross"]].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)}
            style={{
              flex: 1, textAlign: "center", padding: "7px", borderRadius: "7px", cursor: "pointer",
              border: "none", fontFamily: "inherit", fontSize: "12px", fontWeight: 700,
              background: view === id ? "#1f7a48" : "rgba(255,255,255,.07)",
              color: view === id ? INK : MUTED,
            }}>{label}</button>
        ))}
      </div>

      {roundIds.length > 1 && view !== "weekend" && (
        <div style={{ display: "flex", gap: "6px", padding: "8px 14px 0" }}>
          {roundIds.map((id) => (
            <button key={id} onClick={() => setRoundId(id)}
              style={{
                padding: "4px 11px", borderRadius: "6px", cursor: "pointer", border: "none",
                fontFamily: "inherit", fontSize: "11px", fontWeight: 700,
                background: roundId === id ? "rgba(255,255,255,.16)" : "transparent",
                color: roundId === id ? INK : DIM,
              }}>R{id}</button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "10px", padding: "12px 14px 6px", fontSize: "9.5px", fontWeight: 700, letterSpacing: ".11em", color: DIM, textTransform: "uppercase" }}>
        <span style={{ width: "26px" }} />
        <span style={{ flex: 1 }}>Player</span>
        <span style={{ width: "46px", textAlign: "center" }}>Thru</span>
        <span style={{ width: "50px", textAlign: "right" }}>{view === "gross" ? "Gross" : "Net"}</span>
        <span style={{ width: "16px" }} />
      </div>

      {rows.map((r, i) => {
        const d = delta[r.player.id] || 0;
        const me = meId && r.player.id === meId;
        return (
          <div key={r.player.id}
            style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "9px 14px", borderTop: `1px solid ${LINE}`,
              background: me ? HILITE : i % 2 ? BAND : "transparent",
              opacity: r.started ? 1 : 0.45,
            }}>
            <div style={{ width: "26px", fontSize: "15px", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: GOLDL }}>
              {r.started ? `${r.tied ? "T" : ""}${r.position}` : "–"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "16px", fontWeight: 600 }}>{r.player.name}</div>
              <div style={{ fontSize: "10.5px", fontWeight: 500, color: DIM, marginTop: "3px" }}>
                {r.player.hcpIndex} idx
                {view === "weekend"
                  ? ` · ${r.roundsStarted} of ${weekend.roundIds.length} rounds`
                  : r.started ? ` · plays off ${r.courseHcp}` : " · not started"}
              </div>
            </div>
            <div style={{ width: "46px", textAlign: "center", fontSize: "12px", fontWeight: 600, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
              {r.started ? (r.complete ? "F" : r.thru) : "–"}
            </div>
            <div style={{ width: "50px", textAlign: "right", fontSize: "19px", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: r.started ? scoreColor(scoreOf(r)) : DIM }}>
              {r.started ? fmtToPar(scoreOf(r)) : "–"}
            </div>
            <div style={{ width: "16px", textAlign: "center", fontSize: "11px", fontWeight: 700, color: d > 0 ? UNDER : d < 0 ? OVER : "#4a6b57" }}>
              {d > 0 ? "▲" : d < 0 ? "▼" : "–"}
            </div>
          </div>
        );
      })}

      <div style={{ padding: "10px 14px", background: BAR, fontSize: "11px", lineHeight: 1.5, color: DIM, borderTop: "1px solid rgba(255,255,255,.08)" }}>
        {view === "gross"
          ? "Gross to par over holes played."
          : "Net to par — handicap strokes counted on the holes actually played."}
        {view !== "weekend" && round && ` · ${round.playersStarted} of ${rows.length} started`}
        <div style={{ marginTop: "7px", display: "flex", alignItems: "center", gap: "7px" }}>
          <span>You</span>
          <select value={meId ?? ""} onChange={(e) => pickMe(e.target.value)}
            style={{
              background: "rgba(255,255,255,.07)", color: MUTED, border: `1px solid ${LINE}`,
              borderRadius: "6px", padding: "3px 6px", fontSize: "11px", outline: "none",
            }}>
            <option value="">nobody</option>
            {(event.players || []).map((p) => (
              <option key={p.id} value={p.id} style={{ color: "#000" }}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <style>{`@keyframes poPulse{70%{box-shadow:0 0 0 7px rgba(255,91,82,0)}100%{box-shadow:0 0 0 0 rgba(255,91,82,0)}}`}</style>
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{ background: BOARD, color: MUTED, borderRadius: "14px", padding: "40px 20px", textAlign: "center", fontSize: "14px", maxWidth: "760px", margin: "0 auto" }}>
      {children}
    </div>
  );
}
