/**
 * archive-weekend.mjs — Save a weekend's data to a committed JSON file.
 *
 *   node scripts/archive-weekend.mjs pocono-2026
 *
 * Captures the event doc plus the shared course library and the weekend index,
 * so the archive is enough to reconstruct or audit the event on its own.
 *
 * The `presence` subcollection is deliberately skipped — it's ephemeral
 * who's-on-the-app-right-now data, and Firestore rules don't allow reading it
 * outside the app anyway.
 */
import fs from "fs";
import path from "path";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const id = process.argv[2];
if (!id) {
  console.error("Usage: node scripts/archive-weekend.mjs <weekendId>");
  process.exit(1);
}

const app = initializeApp({ apiKey: "AIzaSyA0ubEbHoYbfCSjfNxHUkt_fr_6WMb3t5Y", projectId: "pvgc-league" });
await signInAnonymously(getAuth(app)).catch(() => {});
const db = getFirestore(app);

const snap = await getDoc(doc(db, "weekends", id));
if (!snap.exists()) {
  console.error(`✗ weekends/${id} not found`);
  process.exit(1);
}
const event = snap.data();
const library = (await getDoc(doc(db, "weekends", "_library"))).data() || {};
const index = (await getDoc(doc(db, "weekends", "_index"))).data() || {};

const archive = { weekendId: id, exportedAt: new Date().toISOString(), event, library, index };
const dir = path.join(process.cwd(), "archives");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${id}.json`);
fs.writeFileSync(file, JSON.stringify(archive, null, 2));

// Summary, so a bad export is obvious rather than silently thin
const rounds = Object.entries(event.rounds || {});
console.log(`✓ archives/${id}.json (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
console.log(`  players : ${(event.players || []).length}`);
console.log(`  courses : ${Object.keys(event.courses || {}).length} in the event, ${Object.keys(library).length} in the shared library`);
console.log(`  rounds  : ${rounds.length}`);
for (const [rid, r] of rounds) {
  const scores = Object.values(r.scores || {});
  const holes = scores.reduce((s, a) => s + (Array.isArray(a) ? a.filter(v => v > 0).length : 0), 0);
  console.log(`     round ${rid}: course ${r.courseId}, ${scores.length} players scored, ${holes} hole scores`);
}
const games = Object.entries(event.games || {}).filter(([, g]) => g && g.enabled).map(([k]) => k);
console.log(`  games   : ${games.join(", ") || "none enabled"}`);
console.log(`  sixies  : ${Object.keys(event.sixies?.scores || {}).length} players scored`);
process.exit(0);
