import { useState, useEffect, useCallback, useRef } from "react";
import { onSnapshot, setDoc } from "firebase/firestore";
import { EVENT_DOC } from "./firebase/client";
import { BG, CREAM, G, GO, GOLD, M, R, FB, FD } from "./constants/theme";
import SetupScreen from "./components/SetupScreen";
import CourseScreen from "./components/CourseScreen";
import PairingsScreen from "./components/PairingsScreen";
import ScoringScreen from "./components/ScoringScreen";
import ScattsScreen from "./components/ScattsScreen";
import LeaderboardScreen from "./components/LeaderboardScreen";
import WinningsScreen from "./components/WinningsScreen";
import GamesScreen from "./components/GamesScreen";

const TABS = [
  { id: "leaderboard", label: "Leaderboard" },
  { id: "scoring",     label: "Scoring" },
  { id: "scatts",      label: "Scatts" },
  { id: "winnings",    label: "Winnings" },
  { id: "games",       label: "Games" },
  { id: "pairings",    label: "Pairings" },
  { id: "courses",     label: "Courses" },
  { id: "setup",       label: "Players" },
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
const READ_ONLY_SCREENS = ["leaderboard", "scatts", "winnings"];

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

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(EVENT_DOC, (snap) => {
      if (snap.exists()) {
        setEvent(snap.data());
        setLastSynced(new Date());
      }
    }, (err) => console.warn("Firestore:", err));
    return unsub;
  }, []);

  // Update "ago" display every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // saveEvent supports a localOnly flag — when true, only updates React state
  // (ScoringScreen uses this for optimistic updates, then writes to Firestore itself)
  const saveEvent = useCallback(async (updated, localOnly) => {
    setEvent(updated);
    if (localOnly) return;
    setSaving(true);
    try {
      await setDoc(EVENT_DOC, updated, { merge: true });
      setLastSynced(new Date());
    } catch (e) {
      console.warn("Queued offline:", e.message);
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
    await saveEvent({ ...event, adminPin: newPin || null });
  }

  // Determine if event has scores entered (to decide nav mode)
  const hasPlayers = (event.players || []).length > 0;
  const hasCourses = Object.keys(event.courses || {}).length > 0;
  const isSetupPhase = !hasPlayers || !hasCourses;

  const PRIMARY = isSetupPhase
    ? ["setup", "courses", "pairings"]
    : ["leaderboard", "scoring", "scatts", "winnings"];
  const MORE = isSetupPhase
    ? ["leaderboard", "scoring", "scatts", "winnings"]
    : ["games", "pairings", "courses", "setup"];

  function syncAgo() {
    if (!lastSynced) return null;
    const secs = Math.floor((Date.now() - lastSynced.getTime()) / 1000);
    if (secs < 10) return "just now";
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    return `${mins}m ago`;
  }

  return (
    <div style={{ minHeight: "100dvh", background: BG, color: CREAM, fontFamily: FB }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(15,26,16,0.97)", backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${GOLD}22`,
      }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "0 14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "10px", paddingBottom: "6px" }}>
            <div style={{ fontFamily: FD, fontSize: "20px", fontWeight: 600, color: CREAM }}>
              Pocono Open 2026
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
        <div style={{ background: "#7a4f0022", borderBottom: `1px solid #e6a81744`, padding: "7px 14px", textAlign: "center", fontSize: "12px", color: "#e6a817" }}>
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
            Read-only screens (Leaderboard, Scatts, Winnings) are always accessible.
          </div>
        </div>
      ) : (
        <div>
          {screen === "setup"       && <SetupScreen      event={event} saveEvent={saveEvent} setAdminPin={setAdminPin} authed={authed} />}
          {screen === "courses"     && <CourseScreen      event={event} saveEvent={saveEvent} />}
          {screen === "pairings"    && <PairingsScreen    event={event} saveEvent={saveEvent} />}
          {screen === "scoring"     && <ScoringScreen     event={event} saveEvent={saveEvent} />}
          {screen === "scatts"      && <ScattsScreen      event={event} />}
          {screen === "leaderboard" && <LeaderboardScreen event={event} />}
          {screen === "winnings"    && <WinningsScreen    event={event} />}
          {screen === "games"       && <GamesScreen       event={event} saveEvent={saveEvent} />}
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
