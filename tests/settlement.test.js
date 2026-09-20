import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { settleWeekend, settlementTransfers, totalPots, staleOptOuts } from "../src/lib/settlement.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const POCONO = archive.event;

// A tiny synthetic weekend, so the arithmetic can be checked by hand.
function tinyEvent(over = {}) {
  const course = {
    name: "Test", par: Array(18).fill(4), si: Array.from({ length: 18 }, (_, i) => i + 1),
    slope: 113, rating: 72,
  };
  return {
    players: [
      { id: 1, name: "Ann", hcpIndex: 0 },
      { id: 2, name: "Ben", hcpIndex: 0 },
      { id: 3, name: "Cal", hcpIndex: 0 },
    ],
    courses: { c1: course },
    rounds: { 1: { courseId: "c1", scores: {} } },
    // minRounds 1 because this fixture plays one round; the real weekend is 3.
    games: { lowNet: { enabled: true, pot: 300, payoutPcts: [100], minRounds: 1 } },
    weekendBuyIn: 100,
    optOuts: [],
    birdieOptOuts: [],
    ...over,
  };
}

describe("totalPots", () => {
  it("adds up the real Pocono pots, preferring the per-round scatt pots", () => {
    const p = totalPots(POCONO);
    expect(p.scatts).toBe(500);   // potByRound 100+100+300, not the stale pot: 300
    expect(p.lowNet).toBe(500);
    expect(p.hio).toBe(100);
    expect(p.ctp).toBe(0);
    expect(p.total).toBe(1100);
  });

  it("falls back to a flat scatts pot when there's no per-round breakdown", () => {
    expect(totalPots({ games: { scatts: { pot: 300 } } }).scatts).toBe(300);
  });

  it("is zero across the board with no games", () => {
    expect(totalPots({}).total).toBe(0);
    expect(totalPots(undefined).total).toBe(0);
  });
});

describe("staleOptOuts", () => {
  it("catches the leftover opt-out in the real event", () => {
    // 1779125176722 matches nobody on the roster — someone removed after opting out.
    expect(staleOptOuts(POCONO)).toEqual([1779125176722]);
  });

  it("says nothing when every opt-out is a real player", () => {
    expect(staleOptOuts(tinyEvent({ optOuts: [1] }))).toEqual([]);
  });

  it("doesn't report the same id twice when it's in both lists", () => {
    expect(staleOptOuts(tinyEvent({ optOuts: [99], birdieOptOuts: [99] }))).toEqual([99]);
  });
});

describe("settleWeekend — the number people actually settle on", () => {
  it("nets the buy-in, so a small winner can still be down", () => {
    // Ann wins the whole $300 low-net pot; everyone staked $100.
    const ev = tinyEvent();
    ev.rounds[1].scores = {
      1: Array(18).fill(4),          // level par
      2: Array(18).fill(5),
      3: Array(18).fill(6),
    };
    const s = settleWeekend(ev);
    const ann = s.rows.find(r => r.player.name === "Ann");
    const ben = s.rows.find(r => r.player.name === "Ben");
    expect(ann.won).toBe(300);
    expect(ann.net).toBe(200);       // won 300, staked 100
    expect(ben.won).toBe(0);
    expect(ben.net).toBe(-100);      // the point: zero winnings is not break-even
  });

  it("balances to zero when the pots equal the money collected", () => {
    const ev = tinyEvent();          // 3 × $100 staked, $300 in the low-net pot
    ev.rounds[1].scores = { 1: Array(18).fill(4), 2: Array(18).fill(5), 3: Array(18).fill(6) };
    const s = settleWeekend(ev);
    expect(s.totals.collected).toBe(300);
    expect(s.totals.pots).toBe(300);
    expect(s.totals.unallocated).toBe(0);
    expect(s.totals.net).toBe(0);    // ← the invariant: settlement is zero-sum
  });

  it("someone who opted out stakes nothing", () => {
    const ev = tinyEvent({ optOuts: [3] });
    const s = settleWeekend(ev);
    const cal = s.rows.find(r => r.player.name === "Cal");
    expect(cal.staked).toBe(0);
    expect(cal.playing).toBe(false);
    expect(s.totals.collected).toBe(200);
  });

  it("is sorted best to worst, so the board reads top-down", () => {
    const ev = tinyEvent();
    ev.rounds[1].scores = { 1: Array(18).fill(4), 2: Array(18).fill(5), 3: Array(18).fill(6) };
    const nets = settleWeekend(ev).rows.map(r => r.net);
    expect(nets).toEqual([...nets].sort((a, b) => b - a));
  });

  it("keeps every player, including anyone who never turned in a card", () => {
    const s = settleWeekend(tinyEvent());
    expect(s.rows).toHaveLength(3);
    expect(s.rows.every(r => r.staked === 100)).toBe(true);
    expect(s.rows.every(r => r.net === -100)).toBe(true); // nothing paid out yet
  });

  it("survives an empty event rather than throwing", () => {
    const s = settleWeekend({});
    expect(s.rows).toEqual([]);
    expect(s.totals.net).toBe(0);
  });
});

describe("settleWeekend — the birdie pool", () => {
  const ev = () => {
    const e = tinyEvent({ games: { birdiePool: { enabled: true, 1: true } } });
    // Ann makes one birdie; the other two each owe her $1.
    const ann = Array(18).fill(4); ann[0] = 3;
    e.rounds[1].scores = { 1: ann, 2: Array(18).fill(4), 3: Array(18).fill(4) };
    return e;
  };

  it("credits the birdie maker and debits the others", () => {
    const s = settleWeekend(ev());
    expect(s.rows.find(r => r.player.name === "Ann").birdie).toBe(2);
    expect(s.rows.find(r => r.player.name === "Ben").birdie).toBe(-1);
  });

  it("nets to zero across the field — it's player-to-player, not a pot", () => {
    const s = settleWeekend(ev());
    expect(s.rows.reduce((t, r) => t + r.birdie, 0)).toBe(0);
  });

  it("honours the legacy `birdiePool: true` shape", () => {
    const e = ev(); e.games.birdiePool = true;
    expect(settleWeekend(e).rows.find(r => r.player.name === "Ann").birdie).toBe(2);
  });

  it("skips a round that's been switched off", () => {
    const e = ev(); e.games.birdiePool = { enabled: true, 1: false };
    expect(settleWeekend(e).rows.every(r => r.birdie === 0)).toBe(true);
  });

  it("ignores it entirely when disabled", () => {
    const e = ev(); e.games.birdiePool = { enabled: false, 1: true };
    expect(settleWeekend(e).rows.every(r => r.birdie === 0)).toBe(true);
  });

  it("leaves a birdie-pool opt-out out of it, still staked in the main pots", () => {
    const e = ev(); e.birdieOptOuts = [3];
    const s = settleWeekend(e);
    const cal = s.rows.find(r => r.player.name === "Cal");
    expect(cal.birdie).toBe(0);
    expect(cal.inBirdiePool).toBe(false);
    expect(cal.staked).toBe(100);
    // Ann now only collects from Ben.
    expect(s.rows.find(r => r.player.name === "Ann").birdie).toBe(1);
  });
});

describe("settleWeekend — the real 2026 weekend", () => {
  const s = settleWeekend(POCONO);

  it("stakes all twelve, the stale opt-out matching nobody", () => {
    expect(s.rows).toHaveLength(12);
    expect(s.totals.collected).toBe(1200);
    expect(s.buyIn).toBe(100);
  });

  it("reports the $100 the pots don't account for instead of hiding it", () => {
    expect(s.totals.pots).toBe(1100);
    expect(s.totals.unallocated).toBe(100);
  });

  it("reports the scatt rounding drift rather than absorbing it", () => {
    // Math.round on each player's scatt share doesn't land back on the pot.
    expect(s.totals.payoutDrift).toBe(1);
  });

  it("turns a player the winnings screen shows at $0 into the loss they took", () => {
    // calcWinnings has Russ on $0 — no scatts, no low net, no CTP, no hole in one.
    const russ = s.rows.find(r => /russ/i.test(r.player.name));
    expect(russ.scatts + russ.lowNet + russ.ctp + russ.hio).toBe(0);
    expect(russ.birdie).toBe(-28);   // and he owes the birdie pool on top
    expect(russ.net).toBe(-128);     // the real number he settles
  });

  it("turns a small winner into a net loser", () => {
    const jc = s.rows.find(r => /^jc$/i.test(r.player.name));
    expect(jc.scatts).toBe(14);      // the screen's headline "+$14"
    expect(jc.net).toBe(-102);       // what he actually owes
  });

  it("leaves only four players genuinely up on the weekend", () => {
    expect(s.rows.filter(r => r.net > 0).map(r => r.player.name)).toEqual(["Steve", "Karl", "Jake", "Jeff"]);
    expect(s.rows.filter(r => r.net < 0)).toHaveLength(8);
  });

  it("has a birdie pool that cancels out across the twelve", () => {
    expect(s.rows.reduce((t, r) => t + r.birdie, 0)).toBe(0);
  });

  it("nets out to the unallocated money plus the drift, and nothing else", () => {
    // Every dollar is accounted for: what's collected either comes back as a
    // payout or shows up in these two named gaps.
    expect(s.totals.net).toBe(s.totals.paidOut - s.totals.collected);
    expect(s.totals.net).toBe(-s.totals.unallocated + s.totals.payoutDrift);
  });
});

describe("settlementTransfers", () => {
  const rows = (...pairs) => pairs.map(([name, net], i) => ({ player: { id: i + 1, name }, net }));

  it("settles a simple two-way split", () => {
    const t = settlementTransfers(rows(["Ann", 100], ["Ben", -100]));
    expect(t).toEqual([{ from: "Ben", fromId: 2, to: "Ann", toId: 1, amount: 100 }]);
  });

  it("clears everyone in a three-way", () => {
    const t = settlementTransfers(rows(["Ann", 200], ["Ben", -100], ["Cal", -100]));
    expect(t).toHaveLength(2);
    expect(t.every(x => x.to === "Ann")).toBe(true);
    expect(t.reduce((s, x) => s + x.amount, 0)).toBe(200);
  });

  it("splits one debt across two winners", () => {
    const t = settlementTransfers(rows(["Ann", 60], ["Ben", 40], ["Cal", -100]));
    expect(t.every(x => x.from === "Cal")).toBe(true);
    expect(t.map(x => x.amount).sort((a, b) => b - a)).toEqual([60, 40]);
  });

  it("needs no transfers when nobody is up or down", () => {
    expect(settlementTransfers(rows(["Ann", 0], ["Ben", 0]))).toEqual([]);
  });

  it("moves no more than what's owed, even when the books don't balance", () => {
    // The real event doesn't balance; transfers must still not invent money.
    const t = settlementTransfers(settleWeekend(POCONO).rows);
    const paid = t.reduce((s, x) => s + x.amount, 0);
    const owed = settleWeekend(POCONO).rows.filter(r => r.net > 0).reduce((s, r) => s + r.net, 0);
    expect(paid).toBeLessThanOrEqual(owed);
    expect(t.every(x => x.amount > 0)).toBe(true);
  });

  it("names both ends of every transfer", () => {
    const t = settlementTransfers(settleWeekend(POCONO).rows);
    expect(t.every(x => x.from && x.to && x.from !== x.to)).toBe(true);
  });
});
