import { useEffect, useMemo, useState } from "react";
import { CARD, CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { subscribeCasual, saveCasual } from "../firebase/client";
import {
  createCasualGame, addCasualPlayer, removeCasualPlayer, listCasualGames,
  upsertCasualGame, deleteCasualGame, gameReadiness,
} from "../lib/casualGames";
import SixiesScreen from "./SixiesScreen";

// Sixies without a tournament: pick a course you've saved, add whoever turned
// up, play. Games are kept so you can reopen one, and the course library is the
// same catalog the weekends use.
export default function CasualScreen({ library }) {
  const [all, setAll] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [name, setName] = useState("");
  const [idx, setIdx] = useState("");

  useEffect(() => subscribeCasual((d) => setAll(d || {})), []);

  const games = useMemo(() => listCasualGames(all), [all]);
  const game = activeId ? all[activeId] : null;
  const courses = library || {};
  const courseList = Object.entries(courses).map(([id, c]) => ({ id, ...c }));
  const readiness = gameReadiness(game, courses);

  const persist = (next) => { setAll(next); saveCasual(next); };
  const update = (g) => persist(upsertCasualGame(all, g));

  function newGame() {
    const g = createCasualGame({});
    persist(upsertCasualGame(all, g));
    setActiveId(g.id);
  }

  function addPlayer() {
    if (!game || !name.trim()) return;
    update(addCasualPlayer(game, { name, hcpIndex: idx }));
    setName(""); setIdx("");
  }

  function remove(id) {
    if (!window.confirm("Delete this game? Scores go with it.")) return;
    persist(deleteCasualGame(all, id));
    if (activeId === id) setActiveId(null);
  }

  const label = { fontSize: "11px", letterSpacing: ".09em", textTransform: "uppercase", color: M, fontWeight: 600 };
  const input = {
    padding: "9px 11px", borderRadius: "8px", border: `1px solid ${GOLD}44`,
    background: CARD, color: CREAM, fontFamily: FB, fontSize: "14px", outline: "none", width: "100%",
  };
  const btn = (bg = G) => ({
    padding: "9px 14px", borderRadius: "8px", border: "none", background: bg,
    color: "#fff", fontFamily: FB, fontSize: "13px", fontWeight: 600, cursor: "pointer",
  });

  // ── Playing a game ──
  if (game) {
    const course = courses[game.courseId];
    return (
      <div style={{ maxWidth: "820px", margin: "0 auto", padding: "18px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
          <button onClick={() => setActiveId(null)} style={{ ...btn(CARD2), color: M }}>← All games</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input value={game.label} onChange={(e) => update({ ...game, label: e.target.value })}
              style={{ ...input, fontFamily: FD, fontSize: "20px", fontWeight: 700, border: "none", background: "transparent", padding: "2px 0" }} />
            <div style={{ fontSize: "12px", color: M }}>{game.date} · {course ? course.name : "no course yet"}</div>
          </div>
        </div>

        {!readiness.ready && (
          <div style={{ background: GO + "14", border: `1px solid ${GO}44`, borderRadius: "10px", padding: "12px 14px", marginBottom: "14px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: GO, marginBottom: "6px" }}>Before you can score</div>
            <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: CREAM }}>
              {readiness.problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>
        )}

        <div style={{ background: CARD2, borderRadius: "12px", padding: "14px", marginBottom: "16px" }}>
          <div style={{ ...label, marginBottom: "8px" }}>Course</div>
          <select value={game.courseId || ""} onChange={(e) => update({ ...game, courseId: e.target.value || null })} style={input}>
            <option value="">Choose a saved course…</option>
            {courseList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {!courseList.length && (
            <div style={{ fontSize: "12px", color: M, marginTop: "8px" }}>
              No saved courses yet — add one on the Courses tab and it'll be here next time.
            </div>
          )}

          <div style={{ ...label, margin: "16px 0 8px" }}>Who's playing ({(game.players || []).length})</div>
          {(game.players || []).map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 0", borderBottom: `1px solid ${GOLD}22` }}>
              <span style={{ flex: 1, fontSize: "14px", fontWeight: 600, color: CREAM }}>{p.name}</span>
              <span style={{ fontSize: "13px", color: M }}>{p.hcpIndex} idx</span>
              <button onClick={() => update(removeCasualPlayer(game, p.id))}
                style={{ border: "none", background: "transparent", color: R, cursor: "pointer", fontSize: "13px" }}>✕</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
              onKeyDown={(e) => e.key === "Enter" && addPlayer()} style={{ ...input, flex: "2 1 140px", width: "auto" }} />
            <input value={idx} onChange={(e) => setIdx(e.target.value)} placeholder="Index" inputMode="decimal"
              onKeyDown={(e) => e.key === "Enter" && addPlayer()} style={{ ...input, flex: "1 1 80px", width: "auto" }} />
            <button onClick={addPlayer} style={btn()}>Add</button>
          </div>
        </div>

        {readiness.ready && (
          <SixiesScreen
            players={game.players}
            courses={courses}
            sixies={game}
            saveSixies={(next) => update({ ...game, ...next })}
            library={courses}
          />
        )}
      </div>
    );
  }

  // ── Picking a game ──
  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap", marginBottom: "4px" }}>
        <h2 style={{ fontFamily: FD, fontSize: "26px", fontWeight: 700, color: CREAM, margin: 0 }}>Casual games</h2>
        <button onClick={newGame} style={{ ...btn(), marginLeft: "auto" }}>+ New game</button>
      </div>
      <p style={{ fontSize: "13px", color: M, margin: "0 0 18px" }}>
        Sixies outside the tournament. Pick a course you've saved, add whoever turned up.
      </p>

      {!games.length && (
        <div style={{ background: CARD2, borderRadius: "12px", padding: "30px 20px", textAlign: "center", color: M, fontSize: "14px" }}>
          No games yet. Start one and it'll be here whenever you come back.
        </div>
      )}

      {games.map((g) => {
        const c = courses[g.courseId];
        const n = (g.players || []).length;
        return (
          <div key={g.id} onClick={() => setActiveId(g.id)}
            style={{ background: CARD2, borderRadius: "12px", padding: "13px 15px", marginBottom: "9px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "15px", fontWeight: 600, color: CREAM }}>{g.label}</div>
              <div style={{ fontSize: "12px", color: M, marginTop: "2px" }}>
                {g.date} · {c ? c.name : "no course"} · {n} player{n === 1 ? "" : "s"}
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); remove(g.id); }}
              style={{ border: "none", background: "transparent", color: R, cursor: "pointer", fontSize: "13px" }}>Delete</button>
          </div>
        );
      })}
    </div>
  );
}
