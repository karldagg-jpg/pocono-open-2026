import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { recapData, drawRecap, recapFileName, CARD_W, CARD_H } from "../src/lib/recapCard.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const d = recapData(archive.event, { label: "Pocono Open 2026", library: archive.library });

describe("recapData — Pocono 2026", () => {
  it("crowns the winner", () => {
    expect(d.podium[0]).toEqual({ pos: 1, names: ["Steve"], total: 214 });
  });

  it("shares a place on a tie and skips the next", () => {
    // Jake 218 and Karl 219 are second and third outright in 2026.
    expect(d.podium.map((p) => p.pos)).toEqual([1, 2, 3]);
    const e = JSON.parse(JSON.stringify(archive.event));
    const jake = e.players.find((p) => p.name === "Jake").id;
    e.rounds[3].scores[jake] = e.rounds[3].scores[jake].map((s, h) => (h === 0 ? s - 1 : s));   // Jake 217
    const karl = e.players.find((p) => p.name === "Karl").id;
    e.rounds[3].scores[karl] = e.rounds[3].scores[karl].map((s, h) => (h < 2 ? s - 1 : s));    // Karl 217
    const tied = recapData(e, { library: archive.library });
    expect(tied.podium[1]).toEqual({ pos: 2, names: expect.arrayContaining(["Jake", "Karl"]), total: 217 });
    expect(tied.podium).toHaveLength(2);
  });

  it("names the courses", () => {
    // The tees in brackets are dropped — there's no room for them on the card.
    expect(d.subtitle).toBe("Buck Hill Golf Club White/blue · Great Bear Golf Club · Woodloch Springs");
  });

  it("shows only money won — nobody's losses on a card that gets passed around", () => {
    expect(d.money.length).toBeGreaterThan(0);
    expect(d.money.every((m) => m.net > 0)).toBe(true);
    expect(d.money[0]).toEqual({ name: "Steve", net: 197 });
  });

  it("has the weekend's birdie count and its leader", () => {
    expect(d.moments.join(" ")).toMatch(/Most birdies — \w+/);
    expect(d.moments.at(-1)).toMatch(/^\d+ birdies in all$/);
  });

  it("says it's still being played before anyone has finished", () => {
    const e = JSON.parse(JSON.stringify(archive.event));
    for (const s of Object.values(e.rounds[3].scores)) s[17] = 0;
    const live = recapData(e, { library: archive.library });
    expect(live.finished).toBe(false);
    expect(live.podium).toEqual([]);
  });
});

describe("drawRecap", () => {
  // A stand-in canvas that records what's drawn.
  function fakeCtx() {
    const drawn = [];
    return {
      drawn,
      fillRect() {},
      fillText(t) { drawn.push(String(t)); },
      measureText(t) { return { width: String(t).length * 20 }; },
      set fillStyle(v) {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {},
    };
  }

  it("draws the title, winner, podium, moments and money", () => {
    const ctx = fakeCtx();
    drawRecap(ctx, d);
    const all = ctx.drawn.join(" | ");
    expect(all).toMatch(/Pocono Open 2026/);
    expect(all).toMatch(/WINNER \| Steve \| 214/);
    expect(all).toMatch(/Jake/);
    expect(all).toMatch(/MOMENTS/);
    expect(all).toMatch(/TOOK THE MONEY \| Steve \| \+\$197/);
  });

  it("shortens anything too wide instead of running off the card", () => {
    const ctx = fakeCtx();
    drawRecap(ctx, { ...d, title: "A".repeat(200) });
    const title = ctx.drawn.find((t) => t.startsWith("AAA"));
    expect(title.endsWith("…")).toBe(true);
    expect(title.length * 20).toBeLessThanOrEqual(CARD_W);
  });

  it("wraps a long course line onto a second row rather than cutting it", () => {
    const ctx = fakeCtx();
    drawRecap(ctx, { ...d, subtitle: "One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen" });
    const rows = ctx.drawn.filter((t) => /One|Twelve|Thirteen/.test(t));
    expect(rows.length).toBe(2);
    expect(rows.join(" ")).toMatch(/Thirteen/);
  });

  it("is the shape a group text shows uncropped", () => {
    expect(CARD_H / CARD_W).toBeCloseTo(1.25);
  });
});

describe("recapFileName", () => {
  it("makes a tidy file name", () => {
    expect(recapFileName("Pocono Open 2026")).toBe("pocono-open-2026-recap.png");
    expect(recapFileName("")).toBe("weekend-recap.png");
  });
});
