import { useState } from "react";
import { CREAM, G, M, R, FD, FB } from "../constants/theme";
import { sendOrganizerLink, completeOrganizerSignIn, isSignInLink, SIGNIN_EMAIL_KEY } from "../firebase/client";
import { looksLikeEmail } from "../lib/organizers";

// Organizers sign in with a link sent to their email — no password to forget.
// Tapping the link signs in. In an iPhone home-screen app the link opens in
// Safari instead, so it can also be copied from the email and pasted here.
export default function OrganizerSignIn({ reason = "Setting up the weekend is for organizers." }) {
  const stored = (() => { try { return localStorage.getItem(SIGNIN_EMAIL_KEY) || ""; } catch { return ""; } })();
  const [email, setEmail] = useState(stored);
  const [sent, setSent] = useState(!!stored);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setError("");
    if (!looksLikeEmail(email)) { setError("That doesn't look like an email address."); return; }
    setBusy(true);
    try {
      await sendOrganizerLink(email.trim());
      setSent(true);
    } catch (e) {
      setError(e?.code === "auth/unauthorized-continue-uri" || e?.code === "auth/unauthorized-domain"
        ? "This web address isn't allowed to sign in yet — add it under Firebase → Authentication → Settings → Authorized domains."
        : "Couldn't send the link. Check the address and your signal, then try again.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setError("");
    const l = link.trim();
    if (!isSignInLink(l)) { setError("That isn't the sign-in link — copy the whole link from the email."); return; }
    setBusy(true);
    try {
      await completeOrganizerSignIn(email.trim(), l);
    } catch {
      setError("That link has expired or was already used. Send a new one.");
    } finally {
      setBusy(false);
    }
  }

  const input = { width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #c8d0c8", background: "#fff", fontFamily: FB, fontSize: "16px", color: CREAM, boxSizing: "border-box" };
  const button = { width: "100%", padding: "12px", borderRadius: "10px", border: "none", background: G, color: "#fff", fontFamily: FB, fontSize: "15px", fontWeight: 700, cursor: busy ? "wait" : "pointer" };

  return (
    <div style={{ maxWidth: "380px", margin: "48px auto", padding: "0 18px" }}>
      <div style={{ fontFamily: FD, fontSize: "26px", fontWeight: 600, color: CREAM, marginBottom: "6px" }}>Organizer sign-in</div>
      <div style={{ fontSize: "14px", color: M, marginBottom: "20px", lineHeight: 1.5 }}>
        {reason} Scores, the board and signing cards don't need it.
      </div>

      <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: M, marginBottom: "6px" }} htmlFor="org-email">Your email</label>
      <input id="org-email" type="email" autoComplete="email" inputMode="email" value={email}
        onChange={(e) => { setEmail(e.target.value); setSent(false); }} style={input} />
      <button onClick={send} disabled={busy} style={{ ...button, marginTop: "10px", background: sent ? "#fff" : G, color: sent ? G : "#fff", border: sent ? `1px solid ${G}` : "none" }}>
        {sent ? "Send another link" : busy ? "Sending…" : "Email me a sign-in link"}
      </button>

      {sent && (
        <div style={{ marginTop: "22px" }}>
          <div style={{ fontSize: "14px", color: CREAM, lineHeight: 1.5, marginBottom: "10px" }}>
            Check your email and tap the link. Using the app from your home screen? Copy the link from the email and paste it here instead.
          </div>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste the sign-in link" aria-label="Sign-in link" style={input} />
          <button onClick={finish} disabled={busy || !link.trim()} style={{ ...button, marginTop: "10px", opacity: link.trim() ? 1 : 0.5 }}>Sign in</button>
        </div>
      )}

      {error && <div role="alert" style={{ marginTop: "14px", fontSize: "13px", color: R, lineHeight: 1.45 }}>{error}</div>}
    </div>
  );
}
