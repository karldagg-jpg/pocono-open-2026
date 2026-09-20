/**
 * finalize-weekend.mjs — Close a weekend out for good.
 *
 *   node scripts/finalize-weekend.mjs pocono-2026 --dry-run
 *   node scripts/finalize-weekend.mjs pocono-2026
 *
 * Two things, in this order:
 *   1. Lock each played round to the handicap indexes it was played off, so the
 *      result stops moving when someone's index changes later.
 *   2. Mark the weekend archived in the index.
 *
 * Locking is only safe if it reproduces the standings that are there now, so
 * the script checks that itself and refuses to write if anything moved. A
 * finalize that silently changed who won would be worse than no finalize.
 *
 * Rounds already locked are left exactly as they are.
 */
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { lockPlayedRounds, lockStatus } from "../src/lib/handicapLock.js";
import { calcLeaderboard, calcWinnings } from "../src/lib/golfLogic.js";

const id = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!id) {
  console.error("Usage: node scripts/finalize-weekend.mjs <weekendId> [--dry-run]");
  process.exit(1);
}

const app = initializeApp({ apiKey: "AIzaSyA0ubEbHoYbfCSjfNxHUkt_fr_6WMb3t5Y", projectId: "pvgc-league" });
await signInAnonymously(getAuth(app)).catch(() => {});
const db = getFirestore(app);

const ref = doc(db, "weekends", id);
const snap = await getDoc(ref);
if (!snap.exists()) {
  console.error(`✗ weekends/${id} not found`);
  process.exit(1);
}
const event = snap.data();
const library = (await getDoc(doc(db, "weekends", "_library"))).data() || {};

// Courses live in the shared library, so fold them in for the comparison —
// without them nothing scores and the check would pass vacuously.
const withCourses = (e) => ({ ...e, courses: { ...(e.courses || {}), ...library } });

const before = {
  board: calcLeaderboard(withCourses(event)).map((r) => [r.player.name, r.total]),
  money: JSON.stringify(calcWinnings(withCourses(event))),
};

const locked = lockPlayedRounds(event);
const after = {
  board: calcLeaderboard(withCourses(locked)).map((r) => [r.player.name, r.total]),
  money: JSON.stringify(calcWinnings(withCourses(locked))),
};

if (JSON.stringify(before.board) !== JSON.stringify(after.board) || before.money !== after.money) {
  console.error("✗ Refusing to write: locking changed the results.");
  console.error("  before:", JSON.stringify(before.board));
  console.error("  after: ", JSON.stringify(after.board));
  process.exit(1);
}

console.log(`Weekend: ${id}`);
for (const rid of Object.keys(locked.rounds || {}).sort()) {
  const s = lockStatus(locked, rid);
  const was = lockStatus(event, rid);
  console.log(`  round ${rid}: ${s.locked ? `locked, ${s.count} players` : "no scores — left unlocked"}${was.locked ? " (already was)" : ""}`);
}
console.log("  standings and payouts unchanged by the lock ✓");

if (dryRun) {
  console.log("\n--dry-run: nothing written.");
  process.exit(0);
}

await setDoc(ref, locked);

const idxRef = doc(db, "weekends", "_index");
const index = (await getDoc(idxRef)).data() || {};
await setDoc(idxRef, { ...index, [id]: { ...(index[id] || {}), archived: true } }, { merge: true });

console.log(`\n✓ ${id} locked and marked archived.`);
console.log("  Re-export the file with: node scripts/archive-weekend.mjs " + id);
process.exit(0);
