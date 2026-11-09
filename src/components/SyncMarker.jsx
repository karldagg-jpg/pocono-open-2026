import { useEffect, useRef, useState } from "react";
import { GO, G } from "../constants/theme";
import { pendingWrites, waitingLabel } from "../lib/pendingWrites";

// Sits in the header on every screen. Says how many saves are still on this
// phone, and briefly says "All sent" when the last one gets through, so the
// scorekeeper knows a dead spot didn't cost them anything.
export default function SyncMarker({ tracker = pendingWrites }) {
  const [, setTick] = useState(0);
  const [justSent, setJustSent] = useState(false);
  const wasWaiting = useRef(false);

  useEffect(() => tracker.subscribe(() => setTick((t) => t + 1)), [tracker]);

  // While anything is in flight, re-check each second — a save only counts as
  // "waiting" once it's been stuck past the grace period.
  const inFlight = tracker.size() > 0;
  useEffect(() => {
    if (!inFlight) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [inFlight]);

  const label = waitingLabel(tracker.waiting());

  useEffect(() => {
    if (label) { wasWaiting.current = true; setJustSent(false); return; }
    if (!wasWaiting.current) return;
    wasWaiting.current = false;
    setJustSent(true);
    const id = setTimeout(() => setJustSent(false), 3500);
    return () => clearTimeout(id);
  }, [label]);

  if (label) {
    return (
      <span role="status" style={{ fontSize: "12px", fontWeight: 700, color: GO, background: "rgba(138,106,0,.1)", padding: "3px 9px", borderRadius: "999px", whiteSpace: "nowrap" }}>
        {label}
      </span>
    );
  }
  if (justSent) {
    return <span role="status" style={{ fontSize: "12px", fontWeight: 700, color: G, whiteSpace: "nowrap" }}>All sent ✓</span>;
  }
  return null;
}
