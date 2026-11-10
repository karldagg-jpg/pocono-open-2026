/**
 * restore-weekend.mjs — put a weekend back the way its archive recorded it.
 *
 *   node scripts/restore-weekend.mjs pocono-2026            # dry run: shows what would change
 *   node scripts/restore-weekend.mjs pocono-2026 --write    # backs up the live copy, then restores
 *   ... --write --move-sixies    # also keeps a later Sixies game, as a Casual game
 *
 * Written after Pocono 2026 was edited in the live app five days after it was
 * archived: Karl's player record deleted and re-added (orphaning his three
 * rounds), round 1 re-paired, and hole 4 re-scored for three players.
 *
 * Before writing, the live version is saved to archives/<id>-live-<date>.json,
 * so a restore never loses anything. After writing, the live doc is read back
 * and compared with the archive. The weekend is marked archived in the index.
 *
 * Sign-in: anonymous while the database rules allow it; once organizer rules
 * are live, run with POCONO_EMAIL set (see signInAsOrganizer.mjs).
 */
import fs from "fs";
import path from "path";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { signInAsOrganizer } from "./signInAsOrganizer.mjs";

const id = process.argv[2];
const write = process.argv.includes("--write");
const moveSixies = process.argv.includes("--move-sixies");
if (!id) {
  console.error("Usage: node scripts/restore-weekend.mjs <weekendId> [--write]");
  process.exit(1);
}

const archiveFile = path.join(process.cwd(), "archives", `${id}.json`);
if (!fs.existsSync(archiveFile)) {
  console.error(`✗ No archive at ${archiveFile}`);
  process.exit(1);
}
const archive = JSON.parse(fs.readFileSync(archiveFile, "utf8"));

const app = initializeApp({ apiKey: "AIzaSyA0ubEbHoYbfCSjfNxHUkt_fr_6WMb3t5Y", projectId: "pvgc-league" });
const db = getFirestore(app);
const ref = doc(db, "weekends", id);
const idxRef = doc(db, "weekends", "_index");

const live = (await getDoc(ref)).data() || null;
const index = (await getDoc(idxRef)).data() || {};

// What would change, in terms a person can check.
const name = (ev, pid) => (ev?.players || []).find((p) => String(p.id) === String(pid))?.name || pid;
const changes = [];
const ids = (ev) => (ev?.players || []).map((p) => String(p.id));
for (const p of archive.event.players) if (!ids(live).includes(String(p.id))) changes.push(`player back: ${p.name}`);
for (const p of live?.players || []) if (!ids(archive.event).includes(String(p.id))) changes.push(`player removed: ${p.name} (added later, id ${p.id})`);
for (const r of Object.keys(archive.event.rounds || {})) {
  const a = archive.event.rounds[r]?.scores || {}, l = live?.rounds?.[r]?.scores || {};
  for (const pid of new Set([...Object.keys(a), ...Object.keys(l)])) {
    if (JSON.stringify(a[pid] || null) !== JSON.stringify(l[pid] || null)) {
      changes.push(`round ${r} card: ${name(archive.event, pid) !== pid ? name(archive.event, pid) : name(live, pid)}`);
    }
  }
}
for (const k of new Set([...Object.keys(archive.event), ...Object.keys(live || {})])) {
  if (k === "players" || k === "rounds") continue;
  if (JSON.stringify(sortKeys(archive.event[k] ?? null)) !== JSON.stringify(sortKeys(live?.[k] ?? null))) changes.push(`${k} differs`);
}
const wasArchived = !!index[id]?.archived;
console.log(`${id}: ${changes.length ? changes.length + " difference(s) from the archive" : "matches the archive"}${wasArchived ? "" : " · not marked archived"}`);
for (const c of changes) console.log(`  · ${c}`);

if (!write) {
  console.log("\nDry run. Re-run with --write to back up the live copy and restore.");
  process.exit(0);
}

// 1. Keep what's there now.
const stamp = new Date().toISOString().slice(0, 10);
const backup = path.join(process.cwd(), "archives", `${id}-live-${stamp}.json`);
fs.writeFileSync(backup, JSON.stringify({ weekendId: id, savedAt: new Date().toISOString(), reason: "backup before restore-weekend", event: live, index }, null, 2));
console.log(`\nSaved the live version to ${path.relative(process.cwd(), backup)}`);

// 2. Restore and mark archived.
const auth = getAuth(app);
if (process.env.POCONO_EMAIL) await signInAsOrganizer(auth);
else await signInAnonymously(auth);

// A weekend doc holds one Sixies game, and later games get played in it. If
// the live one isn't the archived one and has scores, keep it as a Casual
// game (which carries its own players) before the restore replaces it.
const sx = live?.sixies;
const laterGame = sx && JSON.stringify(sortKeys(sx)) !== JSON.stringify(sortKeys(archive.event.sixies)) && Object.keys(sx.scores || {}).length;
if (laterGame && moveSixies) {
  const casualRef = doc(db, "weekends", "_casual");
  // A Sixies player can be someone since deleted from the weekend (Karl was,
  // in 2026) — look in the archive too, or they silently drop out of the game.
  const findPlayer = (pid) => (live.players || []).find((p) => p.id === pid) || (archive.event.players || []).find((p) => p.id === pid);
  const players = (sx.playerIds || []).map(findPlayer).filter(Boolean)
    .map((p) => ({ id: p.id, name: p.name, hcpIndex: p.hcpIndex }));
  if (players.length !== (sx.playerIds || []).length) {
    console.error("✗ The Sixies game has a player in neither the live weekend nor the archive — stopping before any write.");
    process.exit(1);
  }
  const course = (live.courses || {})[sx.courseId] || null;
  const gid = `g_from_${id}_${Date.now().toString(36)}`;
  const game = {
    id: gid,
    label: `${course?.name || "Sixies"} — moved from ${index[id]?.label || id}`,
    date: gameDate(sx.courseId),
    courseId: sx.courseId ?? null,
    players,
    playerIds: players.map((p) => p.id),
    scores: sx.scores || {},
    takes: sx.takes || {},
    junk: sx.junk || {},
    stakes: sx.stakes || { unit: "game", amount: "", note: "" },
    game: sx.game || "front",
  };
  await setDoc(casualRef, { [gid]: game }, { merge: true });
  const check = (await getDoc(casualRef)).data()?.[gid];
  // Compared with sorted keys: Firestore doesn't keep field order, so a plain
  // JSON comparison reported a failure on a perfect copy — and then, because
  // only a missing game stopped the script, it carried on regardless.
  const kept = !!check && JSON.stringify(sortKeys(check)) === JSON.stringify(sortKeys(game));
  if (!kept) {
    console.error("✗ Couldn't keep the Sixies game — stopping before the restore.");
    process.exit(1);
  }
  console.log(`✓ Kept the later Sixies game as a Casual game: ${game.label} (${players.map((p) => p.name).join(", ")})`);
} else if (laterGame) {
  console.log("Note: the live Sixies game differs from the archive and will be replaced (it's in the backup). Use --move-sixies to keep it as a Casual game.");
}
await setDoc(ref, archive.event);
await setDoc(idxRef, { [id]: { ...(index[id] || {}), label: index[id]?.label || archive.index?.[id]?.label || id, archived: true } }, { merge: true });

// 3. Read it back and check.
const after = (await getDoc(ref)).data();
const same = JSON.stringify(sortKeys(after)) === JSON.stringify(sortKeys(archive.event));
const idxAfter = (await getDoc(idxRef)).data() || {};
console.log(same ? "✓ Live weekend now matches the archive exactly." : "✗ Live weekend still differs from the archive — check before going further.");
console.log(idxAfter[id]?.archived ? "✓ Marked archived." : "✗ Not marked archived.");
process.exit(same ? 0 : 1);

// When a Sixies game was played can't be known from the weekend, but it can't
// predate its course: library ids carry the time they were added. Falls back
// to today. Player ids are no guide — they date from when people were added.
function gameDate(courseId) {
  const m = /^c_([0-9a-z]{8})/.exec(String(courseId || ""));
  const t = m ? parseInt(m[1], 36) : NaN;
  return new Date(Number.isFinite(t) && t > Date.UTC(2020, 0, 1) ? t : Date.now()).toISOString().slice(0, 10);
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
