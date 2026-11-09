import { useEffect, useState } from "react";
import { G, M, FB } from "../constants/theme";
import { recapData, drawRecap, recapFileName, CARD_W, CARD_H } from "../lib/recapCard";

// Makes the weekend's recap card on the phone and hands it to the share sheet,
// so it can go straight into the group text. Where sharing files isn't
// supported (most desktops) it downloads instead.
export default function ShareRecap({ event, library, label }) {
  const data = recapData(event, { label, library });
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (!data.finished) return null;

  async function make() {
    setBusy(true);
    setNote("");
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const canvas = document.createElement("canvas");
      canvas.width = CARD_W;
      canvas.height = CARD_H;
      drawRecap(canvas.getContext("2d"), data, {
        display: "'Cormorant Garamond', Georgia, serif",
        body: "Inter, 'Helvetica Neue', Arial, sans-serif",
      });
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      const name = recapFileName(data.title);
      const file = new File([blob], name, { type: "image/png" });
      if (url) URL.revokeObjectURL(url);
      setUrl(URL.createObjectURL(blob));
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: data.title });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setNote("Saved to your downloads.");
      }
    } catch (e) {
      if (e?.name !== "AbortError") setNote("Couldn't make the image on this device.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ margin: "0 0 16px" }}>
      <button onClick={make} disabled={busy}
        style={{ width: "100%", padding: "13px 16px", borderRadius: "12px", border: "none", background: G, color: "#fff", fontFamily: FB, fontSize: "16px", fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
        {busy ? "Making the recap…" : "Share the recap"}
      </button>
      {note && <div role="status" style={{ fontSize: "13px", color: M, marginTop: "6px", textAlign: "center" }}>{note}</div>}
      {url && <img src={url} alt={`${data.title} recap`} style={{ display: "block", width: "100%", maxWidth: "360px", margin: "12px auto 0", borderRadius: "12px" }} />}
    </div>
  );
}
