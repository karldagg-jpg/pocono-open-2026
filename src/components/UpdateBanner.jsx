import { useEffect, useState } from "react";
import { G, FB } from "../constants/theme";
import { onUpdateReady, applyUpdate } from "../lib/swClient";

// A new version has been downloaded. It waits for a tap, so a scorekeeper is
// never reloaded mid-hole.
export default function UpdateBanner() {
  const [worker, setWorker] = useState(null);
  useEffect(() => onUpdateReady(setWorker), []);
  if (!worker) return null;
  return (
    <div role="status" style={{ display: "flex", alignItems: "center", gap: "10px", background: "#e8f4ed", borderBottom: `1px solid ${G}44`, padding: "8px 14px", fontSize: "13px", color: "#1a1f1a" }}>
      <span style={{ flex: 1 }}>A new version of the app is ready.</span>
      <button onClick={() => applyUpdate(worker)}
        style={{ padding: "6px 12px", borderRadius: "8px", border: "none", background: G, color: "#fff", fontFamily: FB, fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
        Update
      </button>
    </div>
  );
}
