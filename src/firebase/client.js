import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, updateDoc, setDoc, deleteDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

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

// Anonymous auth so Firestore security rules can require auth
const auth = getAuth(app);
signInAnonymously(auth).catch(() => {});

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

// Write a single player's scores for a round using dot-notation field path.
// This is concurrent-safe: two people scoring different players won't collide.
export async function savePlayerScore(roundNum, playerId, scores, courseId) {
  const fields = {
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
