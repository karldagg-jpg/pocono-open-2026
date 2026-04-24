import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, updateDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";

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

export const EVENT_DOC = doc(db, "weekends", "pocono-2026");
export const PRESENCE_COL = collection(db, "weekends", "pocono-2026", "presence");

// Write a single player's scores for a round using dot-notation field path.
// This is concurrent-safe: two people scoring different players won't collide.
export async function savePlayerScore(roundNum, playerId, scores, courseId) {
  const fields = {
    [`rounds.${roundNum}.scores.${playerId}`]: scores,
  };
  if (courseId) {
    fields[`rounds.${roundNum}.courseId`] = courseId;
  }
  await updateDoc(EVENT_DOC, fields);
}

// Write a round's courseId using dot-notation
export async function saveRoundCourse(roundNum, courseId) {
  await updateDoc(EVENT_DOC, {
    [`rounds.${roundNum}.courseId`]: courseId,
  });
}

// Presence: announce which group/hole you're scoring
const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function presenceDoc() {
  return doc(PRESENCE_COL, SESSION_ID);
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

export async function clearPresence() {
  try {
    await deleteDoc(presenceDoc());
  } catch (e) {
    // ignore — might already be gone
  }
}

export { db };
