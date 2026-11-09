import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, updateDoc, setDoc, deleteDoc, deleteField, getDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA0ubEbHoYbfCSjfNxHUkt_fr_6WMb3t5Y",
  authDomain: "pvgc-league.firebaseapp.com",
  projectId: "pvgc-league",
  storageBucket: "pvgc-league.firebasestorage.app",
  messagingSenderId: "731595471102",
  appId: "1:731595471102:web:d4ad8bf15746bab7874daf",
};

const app = initializeApp(firebaseConfig);

// Offline persistence — works even with no cell signal
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Everyone is signed in: golfers anonymously, organizers by email. Only sign in
// anonymously when nobody is — doing it unconditionally would sign an
// organizer straight back out every time the app opened.
const auth = getAuth(app);
onAuthStateChanged(auth, (user) => {
  if (!user) signInAnonymously(auth).catch(() => {});
});

// ── Organizer sign-in, by emailed link ───────────────────────────────────────
// No passwords. The link opens the app and signs in; on an iPhone home-screen
// app (which can't receive the link) it can be copied and pasted instead.
export const SIGNIN_EMAIL_KEY = "pocono:signinEmail";

export function onAuth(cb) { return onAuthStateChanged(auth, cb); }

export async function sendOrganizerLink(email, url = window.location.origin + window.location.pathname) {
  await sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
  try { localStorage.setItem(SIGNIN_EMAIL_KEY, email); } catch { /* ignore */ }
}

export function isSignInLink(link) { return isSignInWithEmailLink(auth, link); }

export async function completeOrganizerSignIn(email, link) {
  const cred = await signInWithEmailLink(auth, email, link);
  try { localStorage.removeItem(SIGNIN_EMAIL_KEY); } catch { /* ignore */ }
  return cred.user;
}

/** Back to an anonymous golfer. */
export async function signOutOrganizer() {
  await signOut(auth);   // the listener above signs back in anonymously
}

// ── Active weekend ──────────────────────────────────────────────────────────
// The app can switch between weekends; helpers below target whichever is active.
const DEFAULT_WEEKEND_ID = "pocono-2026";
let activeWeekendId = (() => { try { return localStorage.getItem("po_weekend") || DEFAULT_WEEKEND_ID; } catch { return DEFAULT_WEEKEND_ID; } })();
export function getActiveWeekendId() { return activeWeekendId; }
export function setActiveWeekendId(id) {
  activeWeekendId = id;
  try { localStorage.setItem("po_weekend", id); } catch { /* ignore */ }
}
export function weekendDoc(id = activeWeekendId) { return doc(db, "weekends", id); }
export function presenceCol(id = activeWeekendId) { return collection(db, "weekends", id, "presence"); }

// ── Weekend index ───────────────────────────────────────────────────────────
// { [weekendId]: { label, dates, archived } } — powers the weekend dropdown.
export const INDEX_DOC = doc(db, "weekends", "_index");
export function subscribeIndex(cb) {
  return onSnapshot(INDEX_DOC, (s) => cb(s.exists() ? s.data() : {}), () => cb({}));
}
export async function saveIndex(index) { await setDoc(INDEX_DOC, index); }
export async function createWeekend(id, initialData) { await setDoc(weekendDoc(id), initialData); }

// Shared course library — a catalog of courses reusable across every weekend.
// Stored inside the weekends collection so it inherits the same security rules.
export const LIBRARY_DOC = doc(db, "weekends", "_library");

export function subscribeLibrary(cb) {
  return onSnapshot(LIBRARY_DOC, (snap) => cb(snap.exists() ? snap.data() : {}), () => cb({}));
}

// Full replace of the library catalog ({ [courseId]: {name, slope, rating, par, si} }).
export async function saveLibrary(library) {
  await setDoc(LIBRARY_DOC, library);
}

// One course at a time, so two people editing different courses can't undo
// each other. Falls back to creating the doc the very first time.
export async function saveLibraryCourse(id, course) {
  try {
    await updateDoc(LIBRARY_DOC, { [id]: course });
  } catch (e) {
    if (e.code === "not-found") await setDoc(LIBRARY_DOC, { [id]: course });
    else throw e;
  }
}

export async function deleteLibraryCourse(id) {
  await updateDoc(LIBRARY_DOC, { [id]: deleteField() });
}

// Read other weekends once, for the course history. Missing docs are skipped.
export async function fetchWeekends(ids) {
  const out = [];
  for (const id of ids) {
    try {
      const s = await getDoc(weekendDoc(id));
      if (s.exists()) out.push({ id, event: s.data() });
    } catch { /* offline or no access — history just shows less */ }
  }
  return out;
}

// Casual games — sixies played outside any weekend. Kept in the weekends
// collection for the same reason as the library: it inherits the security rules.
export const CASUAL_DOC = doc(db, "weekends", "_casual");

export function subscribeCasual(cb) {
  return onSnapshot(CASUAL_DOC, (s) => cb(s.exists() ? s.data() : {}), () => cb({}));
}

export async function saveCasual(all) {
  await setDoc(CASUAL_DOC, all);
}

// Write a single player's scores for a round using dot-notation field path.
// This is concurrent-safe: two people scoring different players won't collide.
// `extra` carries other dot-path fields that belong with this save — the
// weekend's own copy of the course, taken with the round's first score.
export async function savePlayerScore(roundNum, playerId, scores, courseId, extra = {}) {
  const fields = {
    ...extra,
    [`rounds.${roundNum}.scores.${playerId}`]: scores,
  };
  if (courseId) {
    fields[`rounds.${roundNum}.courseId`] = courseId;
  }
  await updateDoc(weekendDoc(), fields);
}

// Write a round's courseId using dot-notation
export async function saveRoundCourse(roundNum, courseId) {
  await updateDoc(weekendDoc(), {
    [`rounds.${roundNum}.courseId`]: courseId,
  });
}

// Presence: announce which group/hole you're scoring
const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function presenceDoc() {
  return doc(presenceCol(), SESSION_ID);
}

export async function updatePresence(playerName, roundNum, groupIdx, holeNum) {
  await setDoc(presenceDoc(), {
    name: playerName,
    round: roundNum,
    group: groupIdx,
    hole: holeNum,
    ts: serverTimestamp(),
  });
}

// Full document replace — used for seeding test data
export async function resetEvent(data) {
  await setDoc(weekendDoc(), data);
}

export async function clearPresence() {
  try {
    await deleteDoc(presenceDoc());
  } catch (e) {
    // ignore — might already be gone
  }
}

export { db };
