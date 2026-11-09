// ── The weekend on one card ──────────────────────────────────────────────────
// Something to drop in the group text when it's over: who won, the podium, the
// shots people will still be talking about, and who took the money. Only the
// winners' money is shown — the card gets passed around, and nobody needs
// their losses on it.
import { calcLeaderboard } from "./golfLogic.js";
import { settleWeekend } from "./settlement.js";
import { roundMoments } from "./boardRecap.js";
import { coursesFor } from "./courses.js";
import { roundIds, roundCount } from "./rounds.js";

const first = (name) => String(name || "").split(" ")[0];

export function recapData(event, { label = "", library = {} } = {}) {
  const ev = { ...(event || {}), courses: coursesFor(event, library) };
  const ids = roundIds(ev);
  const n = roundCount(ev);

  // Podium: lowest net over every round, ties sharing a place.
  const board = calcLeaderboard(ev).filter((r) => r.roundsPlayed === n && r.total != null);
  const podium = [];
  let pos = 1;
  // Three places, not three lines: two tied for second fill second and third.
  for (let i = 0; i < board.length && pos <= 3; ) {
    const total = board[i].total;
    const tied = board.filter((r) => r.total === total);
    podium.push({ pos, names: tied.map((r) => r.player.name), total });
    pos += tied.length;
    i += tied.length;
  }

  // Moments: every eagle and ace, then the most birdies of the weekend.
  const all = ids.flatMap((rid) => roundMoments(ev, rid).map((m) => ({ ...m, roundId: rid })));
  const big = all.filter((m) => m.kind !== "birdie").map((m) =>
    m.kind === "hio"
      ? `${first(m.player.name)} — hole in one, round ${m.roundId} #${m.hole}`
      : `${first(m.player.name)} — eagle, round ${m.roundId} #${m.hole}`);
  const birdies = new Map();
  for (const m of all.filter((x) => x.kind === "birdie")) birdies.set(m.player.name, (birdies.get(m.player.name) || 0) + 1);
  const most = Math.max(0, ...birdies.values());
  const moments = [...big];
  if (most > 0) {
    const who = [...birdies].filter(([, c]) => c === most).map(([name]) => first(name));
    moments.push(`Most birdies — ${who.join(" & ")} (${most})`);
  }
  moments.push(`${all.filter((m) => m.kind === "birdie").length} birdies in all`);

  // Money: the top three up on the weekend.
  const money = settleWeekend(ev).rows.filter((r) => r.net > 0).slice(0, 3).map((r) => ({ name: r.player.name, net: r.net }));

  // The course, not the tees: "Buck Hill Golf Club White/blue (White tees)"
  // reads as "Buck Hill Golf Club White/blue" on a card with no room to spare.
  const courseName = (c) => (c?.course || c?.name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  const courses = [...new Set(ids.map((rid) => courseName(ev.courses?.[ev.rounds?.[rid]?.courseId])).filter(Boolean))];

  return {
    title: label || ev.name || "Golf weekend",
    subtitle: courses.join(" · "),
    rounds: n,
    finished: board.length > 0,
    podium,
    moments: moments.slice(0, 5),
    money,
  };
}

// ── Drawing it ──────────────────────────────────────────────────────────────
// Plain canvas calls, so it works on any phone with no library. 1080 × 1350 is
// the shape a group text shows without cropping.
export const CARD_W = 1080;
export const CARD_H = 1350;
const C = { ground: "#0f2a1c", band: "#163826", ink: "#f4f1e8", dim: "#9fb8a8", gold: "#d9b45a", green: "#5fd493" };

/** Up to `lines` lines that fit `max`, the last shortened if it must be. */
function wrap(ctx, text, max, lines = 2) {
  const words = String(text).split(" ");
  const out = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= max || !cur) cur = next;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  if (out.length <= lines) return out;
  return [...out.slice(0, lines - 1), fit(ctx, out.slice(lines - 1).join(" "), max)];
}

function fit(ctx, text, max) {
  let t = String(text);
  if (ctx.measureText(t).width <= max) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export function drawRecap(ctx, d, { display = "Georgia, serif", body = "Helvetica, Arial, sans-serif" } = {}) {
  const pad = 84;
  const max = CARD_W - pad * 2;
  ctx.fillStyle = C.ground; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = C.band; ctx.fillRect(0, 0, CARD_W, 300);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  ctx.fillStyle = C.gold; ctx.font = `700 30px ${body}`;
  ctx.fillText("FINAL", pad, 110);
  ctx.fillStyle = C.ink; ctx.font = `700 82px ${display}`;
  ctx.fillText(fit(ctx, d.title, max), pad, 200);
  ctx.fillStyle = C.dim; ctx.font = `400 28px ${body}`;
  wrap(ctx, d.subtitle || `${d.rounds} rounds`, max).forEach((line, i) => ctx.fillText(line, pad, 250 + i * 36));

  let y = 400;
  const win = d.podium[0];
  ctx.fillStyle = C.gold; ctx.font = `700 28px ${body}`;
  ctx.fillText("WINNER", pad, y);
  ctx.fillStyle = C.ink; ctx.font = `700 76px ${display}`;
  ctx.fillText(fit(ctx, win ? win.names.join(" & ") : "Still being played", max - 220), pad, y + 82);
  if (win) {
    ctx.textAlign = "right"; ctx.fillStyle = C.gold; ctx.font = `800 64px ${body}`;
    ctx.fillText(`${win.total}`, CARD_W - pad, y + 80);
    ctx.font = `400 26px ${body}`; ctx.fillStyle = C.dim;
    ctx.fillText("net", CARD_W - pad, y + 116);
    ctx.textAlign = "left";
  }

  y += 170;
  for (const p of d.podium.slice(1)) {
    ctx.fillStyle = C.dim; ctx.font = `700 34px ${body}`;
    ctx.fillText(`${p.pos}`, pad, y);
    ctx.fillStyle = C.ink; ctx.font = `600 40px ${body}`;
    ctx.fillText(fit(ctx, p.names.join(" & "), max - 200), pad + 70, y);
    ctx.textAlign = "right"; ctx.fillStyle = C.ink;
    ctx.fillText(`${p.total}`, CARD_W - pad, y);
    ctx.textAlign = "left";
    y += 62;
  }

  y += 40;
  ctx.fillStyle = C.gold; ctx.font = `700 28px ${body}`;
  ctx.fillText("MOMENTS", pad, y);
  y += 54;
  ctx.font = `400 36px ${body}`; ctx.fillStyle = C.ink;
  for (const m of d.moments.slice(0, 4)) { ctx.fillText(fit(ctx, m, max), pad, y); y += 52; }

  if (d.money.length) {
    y += 34;
    ctx.fillStyle = C.gold; ctx.font = `700 28px ${body}`;
    ctx.fillText("TOOK THE MONEY", pad, y);
    y += 56;
    for (const m of d.money) {
      ctx.fillStyle = C.ink; ctx.font = `600 40px ${body}`;
      ctx.fillText(fit(ctx, m.name, max - 220), pad, y);
      ctx.textAlign = "right"; ctx.fillStyle = C.green; ctx.font = `800 40px ${body}`;
      ctx.fillText(`+$${m.net}`, CARD_W - pad, y);
      ctx.textAlign = "left";
      y += 58;
    }
  }
}

/** A file-friendly name: "pocono-open-2026-recap.png". */
export function recapFileName(title) {
  const slug = String(title || "weekend").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "weekend"}-recap.png`;
}
