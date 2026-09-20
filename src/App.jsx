import { useState, useEffect, useCallback, useRef } from "react";
import { onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { weekendDoc, setActiveWeekendId, getActiveWeekendId, subscribeIndex, saveIndex, createWeekend, subscribeLibrary } from "./firebase/client";
import { BG, CREAM, G, GO, GOLD, M, R, FB, FD } from "./constants/theme";
import SetupScreen from "./components/SetupScreen";
import CourseScreen from "./components/CourseScreen";
import PairingsScreen from "./components/PairingsScreen";
import ScoringScreen from "./components/ScoringScreen";
import ScattsScreen from "./components/ScattsScreen";
import LeaderboardScreen from "./components/LeaderboardScreen";
import WinningsScreen from "./components/WinningsScreen";
import GamesScreen from "./components/GamesScreen";
import ReplayScreen from "./components/ReplayScreen";
import ThursdayScreen from "./components/ThursdayScreen";
import SixiesScreen from "./components/SixiesScreen";
import LiveScreen from "./components/LiveScreen";
import CasualScreen from "./components/CasualScreen";

const TABS = [
  { id: "live",        label: "Live" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "scoring",     label: "Scoring" },
  { id: "scatts",      label: "Scats" },
  { id: "winnings",    label: "Winnings" },
  { id: "replay",      label: "Replay" },
  { id: "games",       label: "Games" },
  { id: "pairings",    label: "Pairings" },
  { id: "courses",     label: "Courses" },
  { id: "setup",       label: "Players" },
  { id: "thursday",   label: "Thursday" },
  { id: "sixies",      label: "Sixies" },
  { id: "casual",      label: "Casual" },
];

const DEFAULT_EVENT = {
  name: "Pocono Open 2026",
  buyIn: 100,
  players: [],
  courses: {},
  rounds: {},
  pairings: {},
};

// Admin PIN — stored in Firestore as event.adminPin
// Read-only screens (leaderboard, scatts, winnings) don't require PIN
const READ_ONLY_SCREENS = ["live", "leaderboard", "scatts", "winnings", "casual"];

export default function App() {
  const [screen, setScreen] = useState("leaderboard");
  const [event, setEvent] = useState(DEFAULT_EVENT);
  const [online, setOnline] = useState(navigator.onLine);
  const [saving, setSaving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [authed, setAuthed] = useState(() => localStorage.getItem("po_authed") === "true");
  const [pinError, setPinError] = useState(false);
  const [weekendId, setWeekendId] = useState(() => getActiveWeekendId());
  const [weekendIndex, setWeekendIndex] = useState({});
  const [library, setLibrary] = useState({});

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Weekend index (dropdown source)
  useEffect(() => subscribeIndex((idx) => setWeekendIndex(idx || {})), []);

  // Shared course library — single source of truth, independent of any one weekend/round.
  useEffect(() => subscribeLibrary((lib) => setLibrary(lib || {})), []);

  // Subscribe to the active weekend; re-subscribes when the weekend changes.
  useEffect(() => {
    setActiveWeekendId(weekendId);
    setEvent(DEFAULT_EVENT);
    const unsub = onSnapshot(weekendDoc(weekendId), (snap) => {
      setEvent(snap.exists() ? snap.data() : DEFAULT_EVENT);
      setLastSynced(new Date());
    }, (err) => console.warn("Firestore:", err));
    return unsub;
  }, [weekendId]);

  // Seed the index with the active weekend if it isn't listed yet.
  useEffect(() => {
    if (!weekendId || weekendIndex[weekendId]) return;
    const label = event?.name || weekendId;
    saveIndex({ ...weekendIndex, [weekendId]: { label, archived: false } });
  }, [weekendId, weekendIndex, event?.name]);

  function switchWeekend(id) {
    if (!id || id === weekendId) return;
    setActiveWeekendId(id);
    setWeekendId(id);
  }

  async function handleNewWeekend() {
    const label = window.prompt("Name this weekend (e.g. \"Pocono Open 2027\"):");
    if (!label || !label.trim()) return;
    const id = `w_${Date.now().toString(36)}`;
    const blank = { ...DEFAULT_EVENT, name: label.trim() };
    await createWeekend(id, blank);
    await saveIndex({ ...weekendIndex, [id]: { label: label.trim(), archived: false } });
    switchWeekend(id);
  }

  async function toggleArchive() {
    const cur = weekendIndex[weekendId] || { label: event?.name || weekendId, archived: false };
    await saveIndex({ ...weekendIndex, [weekendId]: { ...cur, archived: !cur.archived } });
  }

  // Update "ago" display every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // saveEvent(localState, patch?)
  //   patch = true        → localOnly (ScoringScreen optimistic updates)
  //   patch = { ... }     → write only these fields to Firestore (safe against stale state)
  //   patch = undefined   → write full localState (legacy fallback, avoid for new screens)
  const saveEvent = useCallback(async (updated, patch) => {
    setEvent(updated);
    if (patch === true) return; // localOnly
    setSaving(true);
    const firestoreData = (patch && typeof patch === "object") ? patch : updated;
    try {
      await updateDoc(weekendDoc(), firestoreData);
      setLastSynced(new Date());
    } catch (e) {
      if (e.code === "not-found") {
        // First-time doc creation
        await setDoc(weekendDoc(), updated);
        setLastSynced(new Date());
      } else {
        console.warn("Queued offline:", e.message);
      }
    } finally {
      setSaving(false);
    }
  }, []);

  // PIN logic
  const eventPin = event.adminPin;
  const needsPin = eventPin && !authed && !READ_ONLY_SCREENS.includes(screen);

  function checkPin() {
    if (pinInput === eventPin) {
      setAuthed(true);
      localStorage.setItem("po_authed", "true");
      setPinError(false);
    } else {
      setPinError(true);
    }
  }

  async function setAdminPin(newPin) {
    const patch = { adminPin: newPin || null };
    await saveEvent({ ...event, ...patch }, patch);
  }

  // Determine if event has scores entered (to decide nav mode)
  const hasPlayers = (event.players || []).length > 0;
  const hasCourses = Object.keys(library).length > 0;
  const isSetupPhase = !hasPlayers || !hasCourses;

  const PRIMARY = isSetupPhase
    ? ["setup", "courses", "games", "pairings", "thursday", "winnings"]
    : ["leaderboard", "scoring", "scatts", "replay", "winnings", "thursday"];
  const MORE = isSetupPhase
    ? ["leaderboard", "scoring", "scatts", "replay"]
    : ["games", "sixies", "pairings", "courses", "setup"];

  function syncAgo() {
    if (!lastSynced) return null;
    const secs = Math.floor((Date.now() - lastSynced.getTime()) / 1000);
    if (secs < 10) return "just now";
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    return `${mins}m ago`;
  }

  const weekendOptions = (() => {
    const idx = { ...weekendIndex };
    if (!idx[weekendId]) idx[weekendId] = { label: event?.name || weekendId, archived: false };
    return Object.entries(idx)
      .map(([id, m]) => ({ id, label: m?.label || id, archived: !!m?.archived }))
      .sort((a, b) => (a.archived - b.archived) || a.label.localeCompare(b.label));
  })();
  const curArchived = !!weekendIndex[weekendId]?.archived;

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: CREAM, fontFamily: FB }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(242,244,240,0.97)", backdropFilter: "blur(8px)",
        borderBottom: `1px solid #c8d0c8`,
      }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "0 14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "10px", paddingBottom: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
              <select
                value={weekendId}
                onChange={(e) => switchWeekend(e.target.value)}
                title="Switch weekend"
                style={{
                  fontFamily: FD, fontSize: "20px", fontWeight: 600, color: CREAM,
                  background: "transparent", border: "none", outline: "none", cursor: "pointer",
                  maxWidth: "62vw", textOverflow: "ellipsis",
                }}
              >
                {weekendOptions.map((w) => (
                  <option key={w.id} value={w.id}>{w.label}{w.archived ? " (archived)" : ""}</option>
                ))}
              </select>
              {authed && (
                <>
                  <button onClick={handleNewWeekend} title="New weekend"
                    style={{ padding: "3px 9px", borderRadius: "6px", border: `1px solid ${G}55`, background: G + "18", color: G, fontFamily: FB, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                    + New
                  </button>
                  <button onClick={toggleArchive} title={curArchived ? "Unarchive this weekend" : "Archive this weekend"}
                    style={{ padding: "3px 9px", borderRadius: "6px", border: `1px solid ${GOLD}44`, background: "transparent", color: M, fontFamily: FB, fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                    {curArchived ? "Unarchive" : "Archive"}
                  </button>
                </>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {saving && <span style={{ fontSize: "11px", color: M }}>saving...</span>}
              {lastSynced && !saving && (
                <span className="synced">synced {syncAgo()}</span>
              )}
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: online ? G : "#e6a817" }} title={online ? "Online" : "Offline"} />
            </div>
          </div>

          <div style={{ display: "flex", gap: "4px", paddingBottom: "8px", flexWrap: "wrap" }}>
            {PRIMARY.map((id) => {
              const t = TABS.find((x) => x.id === id);
              return <NavBtn key={id} active={screen === id} onClick={() => { setScreen(id); setMoreOpen(false); }}>{t.label}</NavBtn>;
            })}
            <NavBtn active={MORE.includes(screen) || moreOpen} onClick={() => setMoreOpen((o) => !o)}>
              {isSetupPhase ? "Play" : "Setup"} {moreOpen ? "▲" : "▼"}
            </NavBtn>
          </div>

          {moreOpen && (
            <div style={{ display: "flex", gap: "4px", paddingBottom: "8px" }}>
              {MORE.map((id) => {
                const t = TABS.find((x) => x.id === id);
                return <NavBtn key={id} active={screen === id} onClick={() => { setScreen(id); setMoreOpen(false); }}>{t.label}</NavBtn>;
              })}
            </div>
          )}
        </div>
      </div>

      {!online && (
        <div style={{ background: "#fff3cd", borderBottom: `1px solid #e6c84a`, padding: "7px 14px", textAlign: "center", fontSize: "12px", color: "#7a5500" }}>
          Offline — scores saved locally, will sync when signal returns
        </div>
      )}

      {/* PIN gate for edit screens */}
      {needsPin ? (
        <div style={{ maxWidth: "360px", margin: "60px auto", padding: "30px 20px", textAlign: "center" }}>
          <div style={{ fontFamily: FD, fontSize: "24px", color: CREAM, marginBottom: "8px" }}>Enter PIN</div>
          <div style={{ fontSize: "13px", color: M, marginBottom: "20px" }}>
            A PIN is required to edit scores and settings.
          </div>
          <input
            value={pinInput}
            onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
            onKeyDown={(e) => e.key === "Enter" && checkPin()}
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            style={{
              width: "120px", padding: "12px", textAlign: "center", fontSize: "24px",
              letterSpacing: "0.3em", borderRadius: "10px",
              border: `2px solid ${pinError ? R : GOLD + "44"}`,
              background: "rgba(26,61,36,0.15)", color: CREAM,
              fontFamily: FB, outline: "none",
            }}
          />
          <div style={{ marginTop: "14px" }}>
            <button onClick={checkPin} className="btn" style={{ padding: "10px 30px" }}>Unlock</button>
          </div>
          {pinError && (
            <div style={{ color: R, fontSize: "12px", marginTop: "10px" }}>Wrong PIN</div>
          )}
          <div style={{ marginTop: "24px", fontSize: "12px", color: M }}>
            Read-only screens (Leaderboard, Scats, Winnings) are always accessible.
          </div>
        </div>
      ) : (
        <div>
          {screen === "setup"       && <SetupScreen      event={event} saveEvent={saveEvent} setAdminPin={setAdminPin} authed={authed} />}
          {screen === "courses"     && <CourseScreen      event={event} saveEvent={saveEvent} library={library} />}
          {screen === "pairings"    && <PairingsScreen    event={event} saveEvent={saveEvent} />}
          {screen === "scoring"     && <ScoringScreen     event={event} saveEvent={saveEvent} library={library} />}
          {screen === "scatts"      && <ScattsScreen      event={event} library={library} />}
          {screen === "live"        && <LiveScreen        event={event} library={library} weekendLabel={(weekendIndex[weekendId] || {}).label} />}
          {screen === "leaderboard" && <LeaderboardScreen event={event} library={library} />}
          {screen === "winnings"    && <WinningsScreen    event={event} library={library} />}
          {screen === "games"       && <GamesScreen       event={event} saveEvent={saveEvent} library={library} />}
          {screen === "replay"      && <ReplayScreen      event={event} library={library} />}
          {screen === "thursday"    && <ThursdayScreen    event={event} saveEvent={saveEvent} />}
          {screen === "sixies"      && <SixiesScreen      event={event} saveEvent={saveEvent} library={library} />}
          {screen === "casual"      && <CasualScreen      library={library} />}
        </div>
      )}
    </div>
  );
}

function NavBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 12px", borderRadius: "20px",
      border: `1px solid ${active ? GO : GOLD + "33"}`,
      background: active ? GO + "22" : "transparent",
      color: active ? GO : M,
      fontFamily: FB, fontSize: "12px", letterSpacing: "0.05em",
      textTransform: "uppercase", cursor: "pointer",
      fontWeight: active ? 600 : 400,
    }}>
      {children}
    </button>
  );
}
