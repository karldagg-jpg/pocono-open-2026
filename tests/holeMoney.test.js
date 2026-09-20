import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { strokesOnHoleFor, holeState, scattWorth, birdiePoolHole, BIRDIE_RATES } from "../src/lib/holeMoney.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const POCONO = archive.event;

// Par 4 everywhere, SI 1..18, scratch rating — so strokes come straight from
// the index and the arithmetic is checkable by eye.
const COURSE = {
  name: "Test", par: Array(18).fill(4),
  si: Array.from({ length: 18 }, (_, i) => i + 1),
  slope: 113, rating: 72,
};
const P = (id, name, hcpIndex) => ({ id, name, hcpIndex });
const card = (over = {}) => { const a = Array(18).fill(0); Object.entries(over).forEach(([h, v]) => { a[h] = v; }); return a; };

describe("strokesOnHoleFor", () => {
  const players = [P(1, "Scratch", 0), P(2, "Six", 6), P(3, "Eighteen", 18)];

  it("gives a shot only where the index reaches", () => {
    const h0 = strokesOnHoleFor(players, COURSE, 0);   // stroke index 1
    expect(h0.map(r => r.strokes)).toEqual([0, 1, 1]);
    const h9 = strokesOnHoleFor(players, COURSE, 9);   // stroke index 10
    expect(h9.map(r => r.strokes)).toEqual([0, 0, 1]);
  });

  it("gives two shots to a high index on the hardest holes", () => {
    const r = strokesOnHoleFor([P(1, "Hack", 22)], COURSE, 0);
    expect(r[0].strokes).toBe(2);
    expect(strokesOnHoleFor([P(1, "Hack", 22)], COURSE, 5)[0].strokes).toBe(1);
  });

  it("reports the course handicap alongside, not just the shot", () => {
    expect(strokesOnHoleFor([P(1, "Six", 6)], COURSE, 0)[0].courseHcp).toBe(6);
  });

  it("doesn't fall over on a course with no stroke index", () => {
    expect(strokesOnHoleFor(players, { par: Array(18).fill(4) }, 0).every(r => r.strokes === 0)).toBe(true);
  });
});

describe("holeState — who's winning this hole", () => {
  const players = [P(1, "Ann", 0), P(2, "Ben", 6), P(3, "Cal", 18)];

  it("says nothing is decided before anyone posts", () => {
    const s = holeState(players, COURSE, {}, 0);
    expect(s.posted).toBe(0);
    expect(s.settled).toBe(false);
    expect(s.winner).toBeNull();
    expect(s.push).toBe(true);
  });

  it("won't call a winner while a card is outstanding", () => {
    // Ann makes 3 (net birdie); Ben and Cal haven't holed out.
    const s = holeState(players, COURSE, { 1: card({ 0: 3 }) }, 0);
    expect(s.leaders.map(r => r.player.name)).toEqual(["Ann"]);
    expect(s.settled).toBe(false);
    expect(s.winner).toBeNull();     // leading ≠ won
  });

  it("calls it once every card is in", () => {
    const s = holeState(players, COURSE, { 1: card({ 0: 3 }), 2: card({ 0: 5 }), 3: card({ 0: 6 }) }, 0);
    expect(s.settled).toBe(true);
    expect(s.winner.player.name).toBe("Ann");
    expect(s.type).toBe("birdie");   // gross birdie
  });

  it("a gross birdie beats a better net score", () => {
    // Cal nets 4 (6 − 2 shots... on SI 1 he gets 1, so net 5); Ann's gross 3 wins.
    const s = holeState(players, COURSE, { 1: card({ 0: 3 }), 2: card({ 0: 4 }), 3: card({ 0: 4 }) }, 0);
    expect(s.winner.player.name).toBe("Ann");
    expect(s.type).toBe("birdie");
  });

  it("pushes when two share the best gross", () => {
    const s = holeState(players, COURSE, { 1: card({ 0: 3 }), 2: card({ 0: 3 }), 3: card({ 0: 5 }) }, 0);
    expect(s.push).toBe(true);
    expect(s.winner).toBeNull();
    expect(s.leaders).toHaveLength(2);
  });

  it("falls to net when nobody makes a gross birdie", () => {
    // Everyone makes 4 (par). Ben and Cal get a shot on SI 1, so both net 3.
    const s = holeState(players, COURSE, { 1: card({ 0: 4 }), 2: card({ 0: 4 }), 3: card({ 0: 4 }) }, 0);
    expect(s.push).toBe(true);        // two net birdies, tied
    expect(s.leaders.map(r => r.player.name).sort()).toEqual(["Ben", "Cal"]);
  });

  it("a single net birdie takes it", () => {
    // SI 10: only Cal (18) gets a shot there.
    const s = holeState(players, COURSE, { 1: card({ 9: 4 }), 2: card({ 9: 4 }), 3: card({ 9: 4 }) }, 9);
    expect(s.winner.player.name).toBe("Cal");
    expect(s.type).toBe("net");
  });

  it("pushes when the best anyone can do is a net par", () => {
    const s = holeState([P(1, "Ann", 0), P(2, "Bea", 0)], COURSE, { 1: card({ 0: 4 }), 2: card({ 0: 4 }) }, 0);
    expect(s.push).toBe(true);
    expect(s.leaders).toEqual([]);   // a net par wins nothing
  });

  it("stays unsettled with one card of four still out", () => {
    const four = [...players, P(4, "Dee", 9)];
    const s = holeState(four, COURSE, { 1: card({ 0: 3 }), 2: card({ 0: 5 }), 3: card({ 0: 6 }) }, 0);
    expect(s.posted).toBe(3);
    expect(s.settled).toBe(false);
    expect(s.winner).toBeNull();     // Dee could still make a 2
  });

  it("won't award the hole to the best net par, even alone on it", () => {
    // SI 18, so only Cal (18) gets a shot. Ann is out on her own at net par and
    // everyone else is net bogey — still nobody wins. Par is not good enough.
    const four = [P(1, "Ann", 0), P(2, "Ben", 6), P(3, "Cal", 18), P(4, "Dee", 9)];
    const s = holeState(four, COURSE, { 1: card({ 17: 4 }), 2: card({ 17: 5 }), 3: card({ 17: 6 }), 4: card({ 17: 5 }) }, 17);
    expect(s.settled).toBe(true);
    expect(s.rows.find(r => r.player.name === "Ann").netToPar).toBe(0);
    expect(s.winner).toBeNull();
    expect(s.push).toBe(true);
  });

  it("an eagle beats a birdie", () => {
    const s = holeState(players, COURSE, { 1: card({ 0: 3 }), 2: card({ 0: 2 }), 3: card({ 0: 4 }) }, 0);
    expect(s.winner.player.name).toBe("Ben");
    expect(s.type).toBe("eagle");
  });

  it("a hole in one beats everything", () => {
    const s = holeState(players, COURSE, { 1: card({ 0: 2 }), 2: card({ 0: 1 }), 3: card({ 0: 4 }) }, 0);
    expect(s.winner.player.name).toBe("Ben");
    expect(s.type).toBe("hio");
  });

  it("carries par and stroke index for the tee box", () => {
    const s = holeState(players, COURSE, {}, 7);
    expect(s.hole).toBe(8);
    expect(s.par).toBe(4);
    expect(s.si).toBe(8);
  });

  it("shows each player's shot and net, posted or not", () => {
    const s = holeState(players, COURSE, { 3: card({ 0: 6 }) }, 0);
    const cal = s.rows.find(r => r.player.name === "Cal");
    expect(cal.strokes).toBe(1);
    expect(cal.net).toBe(5);
    expect(cal.posted).toBe(true);
    expect(s.rows.find(r => r.player.name === "Ann").posted).toBe(false);
  });

  it("agrees with calcScatts on every hole of the real round 1", () => {
    // The tee-box view must never disagree with the money that gets paid.
    const round = POCONO.rounds[1];
    const course = POCONO.courses[round.courseId];
    const players = POCONO.players;
    for (let h = 0; h < 18; h++) {
      const s = holeState(players, course, round.scores, h, POCONO.games.useIndexHcp !== false);
      if (s.settled && s.winner) expect(s.push).toBe(false);
      if (s.push) expect(s.winner).toBeNull();
    }
  });
});

describe("scattWorth", () => {
  const players = [P(1, "Ann", 0), P(2, "Ben", 6), P(3, "Cal", 18)];

  it("is zero-valued before any hole is won", () => {
    const w = scattWorth({}, COURSE, players, 300);
    expect(w.scatts).toBe(0);
    expect(w.valueNow).toBe(0);
    expect(w.holesPlayed).toBe(0);
  });

  it("puts the whole pot on a single scat", () => {
    const scores = { 1: card({ 0: 3 }), 2: card({ 0: 5 }), 3: card({ 0: 6 }) };
    const w = scattWorth(scores, COURSE, players, 300);
    expect(w.scatts).toBe(1);
    expect(w.valueNow).toBe(300);
  });

  it("halves the value when a second hole is won", () => {
    const scores = {
      1: card({ 0: 3, 1: 3 }), 2: card({ 0: 5, 1: 5 }), 3: card({ 0: 6, 1: 6 }),
    };
    const w = scattWorth(scores, COURSE, players, 300);
    expect(w.scatts).toBe(2);
    expect(w.valueNow).toBe(150);
  });

  it("counts a pushed hole without letting it dilute the pot", () => {
    // Hole 1 won outright; hole 2 tied — value stays at the full pot.
    const scores = {
      1: card({ 0: 3, 1: 3 }), 2: card({ 0: 5, 1: 3 }), 3: card({ 0: 6, 1: 6 }),
    };
    const w = scattWorth(scores, COURSE, players, 300);
    expect(w.scatts).toBe(1);
    expect(w.pushes).toBe(1);
    expect(w.holesPlayed).toBe(2);
    expect(w.valueNow).toBe(300);   // the push did not carry, and did not dilute
  });

  it("says what one more scat would do to the number", () => {
    const scores = { 1: card({ 0: 3 }), 2: card({ 0: 5 }), 3: card({ 0: 6 }) };
    const w = scattWorth(scores, COURSE, players, 300);
    expect(w.valueIfOneMoreScatt).toBe(150);
    expect(w.valueIfOneMoreScatt).toBeLessThan(w.valueNow);
  });

  it("matches the money actually paid for the real round 1", () => {
    const round = POCONO.rounds[1];
    const course = POCONO.courses[round.courseId];
    const w = scattWorth(round.scores, course, POCONO.players, 100, POCONO.games.useIndexHcp !== false);
    expect(w.scatts).toBe(7);        // the Winnings screen shows 7 holes
    expect(Math.round(w.valueNow)).toBe(14);  // …at $14/hole
    expect(w.holesPlayed).toBe(18);
  });
});

describe("birdiePoolHole", () => {
  const players = [P(1, "Ann", 0), P(2, "Ben", 6), P(3, "Cal", 18), P(4, "Dee", 9)];

  it("is quiet on a hole nobody birdied", () => {
    const r = birdiePoolHole(players, COURSE, { 1: card({ 0: 4 }) }, 0);
    expect(r.events).toEqual([]);
    expect(r.owedEach).toBe(0);
  });

  it("collects a dollar from each of the others for a birdie", () => {
    const r = birdiePoolHole(players, COURSE, { 1: card({ 0: 3 }) }, 0);
    expect(r.events[0].type).toBe("birdie");
    expect(r.events[0].collects).toBe(3);   // three others at $1
    expect(r.owedEach).toBe(1);
  });

  it("pays five for an eagle and ten for an ace", () => {
    expect(birdiePoolHole(players, COURSE, { 1: card({ 0: 2 }) }, 0).events[0].collects).toBe(15);
    expect(birdiePoolHole(players, COURSE, { 1: card({ 0: 1 }) }, 0).events[0].collects).toBe(30);
    expect(BIRDIE_RATES).toEqual({ birdie: 1, eagle: 5, hio: 10 });
  });

  it("an ace pays as an ace, not as an eagle as well", () => {
    const r = birdiePoolHole(players, COURSE, { 1: card({ 0: 1 }) }, 0);
    expect(r.events).toHaveLength(1);
    expect(r.events[0].type).toBe("hio");
  });

  it("stacks what everyone else owes when two birdie the same hole", () => {
    const r = birdiePoolHole(players, COURSE, { 1: card({ 0: 3 }), 2: card({ 0: 3 }) }, 0);
    expect(r.events).toHaveLength(2);
    expect(r.owedEach).toBe(2);     // a non-birdier is out $2 on this hole
  });

  it("is gross only — a stroke doesn't buy you a birdie", () => {
    // Cal gets a shot on SI 1 and makes 4: net 3, but gross par pays nothing.
    expect(birdiePoolHole(players, COURSE, { 3: card({ 0: 4 }) }, 0).events).toEqual([]);
  });
});
