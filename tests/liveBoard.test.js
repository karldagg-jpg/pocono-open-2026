import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  holesThrough, strokesThrough, parThrough, playerRoundState,
  rankByNetToPar, liveRound, liveWeekend, positionDelta,
} from "../src/lib/liveBoard.js";
import { calcLeaderboard, getEffectiveHcp, totalPar } from "../src/lib/golfLogic.js";

// Real 2026 event — 12 players, 3 rounds, 3 courses.
const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const EVENT = archive.event;
const COURSE = EVENT.courses["3"]; // Woodloch Springs, par 72

// A small synthetic course where the maths is checkable by hand: every hole par
// 4, stroke index running 1..18 in order, so hole N carries stroke index N.
const FLAT = {
  name: "Test Links", slope: 113, rating: 72,
  par: Array(18).fill(4),
  si: Array.from({ length: 18 }, (_, i) => i + 1),
};
const player = (hcpIndex, id = 1, name = "Test") => ({ id, name, hcpIndex });

describe("holesThrough", () => {
  it("counts to the furthest hole with a score", () => {
    expect(holesThrough([4, 5, 4, 0, 0])).toBe(3);
  });
  it("is 0 for an empty or missing card", () => {
    expect(holesThrough([])).toBe(0);
    expect(holesThrough(undefined)).toBe(0);
    expect(holesThrough([0, 0, 0])).toBe(0);
  });
  it("counts through a gap rather than stopping at it", () => {
    // A missed entry mid-round shouldn't make someone look 3 holes back.
    expect(holesThrough([4, 0, 4])).toBe(3);
  });
});

describe("strokesThrough", () => {
  it("gives no strokes to a scratch player", () => {
    expect(strokesThrough(0, FLAT, 18)).toBe(0);
  });
  it("hands out strokes on the low-index holes first", () => {
    // 5 handicap on a course indexed 1..18: strokes on holes 1-5 only.
    expect(strokesThrough(5, FLAT, 3)).toBe(3);
    expect(strokesThrough(5, FLAT, 5)).toBe(5);
    expect(strokesThrough(5, FLAT, 9)).toBe(5);
    expect(strokesThrough(5, FLAT, 18)).toBe(5);
  });
  it("gives a full handicap over the full round", () => {
    for (const h of [0, 1, 9, 18, 24, 36]) {
      expect(strokesThrough(h, FLAT, 18), `hcp ${h}`).toBe(h);
    }
  });
  it("doubles up above 18", () => {
    // 24 handicap: two strokes on holes 1-6, one on the rest.
    expect(strokesThrough(24, FLAT, 6)).toBe(12);
    expect(strokesThrough(24, FLAT, 18)).toBe(24);
  });
  it("is 0 through no holes", () => {
    expect(strokesThrough(18, FLAT, 0)).toBe(0);
  });
});

describe("strokesThrough — why not proportional", () => {
  it("differs from hcp x thru/18 when the stroke holes come early", () => {
    // The whole reason for counting strokes by index. A 6 handicap on this
    // course has used every stroke by hole 6; proportional would say 2.
    expect(strokesThrough(6, FLAT, 6)).toBe(6);
    expect(Math.round(6 * 6 / 18)).toBe(2);
  });
});

describe("parThrough", () => {
  it("adds up only the holes played", () => {
    expect(parThrough(FLAT, 9)).toBe(36);
    expect(parThrough(FLAT, 18)).toBe(72);
    expect(parThrough(FLAT, 0)).toBe(0);
  });
  it("handles a real card with mixed pars", () => {
    expect(parThrough(COURSE, 18)).toBe(totalPar(COURSE));
  });
});

describe("playerRoundState", () => {
  it("reports a player who hasn't teed off as not started", () => {
    const s = playerRoundState(player(10), FLAT, [], true);
    expect(s.started).toBe(false);
    expect(s.thru).toBe(0);
    expect(s.netToPar).toBe(0);
  });

  it("scores a level-par front nine correctly", () => {
    const scores = [...Array(9).fill(4), ...Array(9).fill(0)];
    const s = playerRoundState(player(0), FLAT, scores, true);
    expect(s.thru).toBe(9);
    expect(s.gross).toBe(36);
    expect(s.toPar).toBe(0);
    expect(s.netToPar).toBe(0);
    expect(s.complete).toBe(false);
  });

  it("applies handicap strokes over the holes played", () => {
    // 5 handicap, bogey on each of the first 5 holes — every one has a stroke,
    // so they are level net despite being 5 over gross.
    const scores = [...Array(5).fill(5), ...Array(13).fill(0)];
    const s = playerRoundState(player(5), FLAT, scores, true);
    expect(s.toPar).toBe(5);
    expect(s.strokes).toBe(5);
    expect(s.netToPar).toBe(0);
  });

  it("marks a finished round complete", () => {
    const s = playerRoundState(player(0), FLAT, Array(18).fill(4), true);
    expect(s.complete).toBe(true);
    expect(s.thru).toBe(18);
  });

  it("can go under par", () => {
    const scores = [...Array(4).fill(3), ...Array(14).fill(0)];
    const s = playerRoundState(player(0), FLAT, scores, true);
    expect(s.netToPar).toBe(-4);
  });
});

describe("rankByNetToPar", () => {
  const mk = (id, netToPar, thru = 9, started = true) => ({ player: { id }, netToPar, thru, started });

  it("puts the lowest net to par first", () => {
    const r = rankByNetToPar([mk(1, 3), mk(2, -1), mk(3, 0)]);
    expect(r.map(x => x.player.id)).toEqual([2, 3, 1]);
    expect(r[0].position).toBe(1);
  });

  it("shares a position on a tie and skips the next", () => {
    const r = rankByNetToPar([mk(1, 2), mk(2, 2), mk(3, 5)]);
    expect(r[0].position).toBe(1);
    expect(r[1].position).toBe(1);
    expect(r[2].position).toBe(3);
    expect(r[0].tied).toBe(true);
    expect(r[2].tied).toBe(false);
  });

  it("breaks a level score by who is further round", () => {
    const r = rankByNetToPar([mk(1, 0, 9), mk(2, 0, 14)]);
    expect(r[0].player.id).toBe(2); // thru 14 sits above thru 9
  });

  it("sends players yet to tee off to the bottom with no position", () => {
    const r = rankByNetToPar([mk(1, 20), mk(2, 0, 0, false)]);
    expect(r[1].player.id).toBe(2);
    expect(r[1].position).toBeNull();
  });

  it("handles an empty field", () => {
    expect(rankByNetToPar([])).toEqual([]);
  });
});

describe("liveRound — against the real event", () => {
  it("builds a board for each round", () => {
    for (const id of ["1", "2", "3"]) {
      const lb = liveRound(EVENT, id);
      expect(lb, `round ${id}`).toBeTruthy();
      expect(lb.rows).toHaveLength(EVENT.players.length);
      expect(lb.playersStarted).toBe(11); // 11 of 12 played
    }
  });

  it("reports a finished round as finished", () => {
    const lb = liveRound(EVENT, "3");
    expect(lb.anyInProgress).toBe(false);
    expect(lb.playersComplete).toBe(11);
  });

  it("returns null for a round or course that doesn't exist", () => {
    expect(liveRound(EVENT, "99")).toBeNull();
    expect(liveRound({ ...EVENT, courses: {} }, "1")).toBeNull();
    expect(liveRound(null, "1")).toBeNull();
  });

  it("ranks the field with no duplicate or skipped logic errors", () => {
    const lb = liveRound(EVENT, "3");
    const started = lb.rows.filter(r => r.started);
    expect(started[0].position).toBe(1);
    for (let i = 1; i < started.length; i++) {
      expect(started[i].netToPar).toBeGreaterThanOrEqual(started[i - 1].netToPar);
      expect(started[i].position).toBeGreaterThanOrEqual(started[i - 1].position);
    }
  });
});

describe("liveRound agrees with calcLeaderboard once a round is complete", () => {
  // The load-bearing invariant: a player must not see one number while playing
  // and a different one afterwards. calcLeaderboard reports net total strokes;
  // the live board reports net relative to par, so they differ by par exactly.
  const useIndex = EVENT.games?.useIndexHcp !== false;

  it.each(["1", "2", "3"])("round %s matches for every player", (id) => {
    const lb = liveRound(EVENT, id);
    const course = EVENT.courses[EVENT.rounds[id].courseId];
    const par = totalPar(course);
    const board = calcLeaderboard(EVENT);
    const ri = ["1", "2", "3"].indexOf(id);

    for (const row of lb.rows.filter(r => r.complete)) {
      const legacy = board.find(b => b.player.id === row.player.id);
      expect(legacy.roundGross[ri], `gross for ${row.player.name}`).toBe(row.gross);
      expect(legacy.roundNets[ri], `net for ${row.player.name}`).toBe(row.netToPar + par);
    }
  });

  it("uses the same course handicap as the legacy calculation", () => {
    const course = EVENT.courses["3"];
    for (const p of EVENT.players) {
      const s = playerRoundState(p, course, (EVENT.rounds["3"].scores || {})[p.id] || [], useIndex);
      if (!s.started) continue;
      expect(s.courseHcp, p.name).toBe(getEffectiveHcp(p, course, useIndex));
      expect(s.strokes, `${p.name} full-round strokes`).toBe(getEffectiveHcp(p, course, useIndex));
    }
  });
});

describe("liveRound mid-round — where calcLeaderboard gives up", () => {
  // Truncate round 3 to 12 holes for everyone.
  const partial = {
    ...EVENT,
    rounds: { ...EVENT.rounds, 3: {
      ...EVENT.rounds["3"],
      scores: Object.fromEntries(Object.entries(EVENT.rounds["3"].scores)
        .map(([id, sc]) => [id, sc.slice(0, 12).concat(Array(6).fill(0))])),
    } },
  };

  it("still ranks the field when the legacy board reports nothing", () => {
    const legacy = calcLeaderboard(partial);
    expect(legacy.every(r => r.roundNets[2] === null)).toBe(true); // legacy: blank

    const lb = liveRound(partial, "3");
    expect(lb.playersStarted).toBe(11);
    expect(lb.anyInProgress).toBe(true);
    expect(lb.rows.filter(r => r.started).every(r => r.thru === 12)).toBe(true);
  });

  it("gives a sensible leader rather than a nonsense one", () => {
    const lb = liveRound(partial, "3");
    const lead = lb.rows.find(r => r.started);
    expect(lead.netToPar).toBeGreaterThan(-18);
    expect(lead.netToPar).toBeLessThan(40);
  });
});

describe("liveWeekend", () => {
  it("totals every round for each player", () => {
    const wk = liveWeekend(EVENT);
    expect(wk.roundIds).toEqual(["1", "2", "3"]);
    const leader = wk.rows.find(r => r.started);
    expect(leader.roundsStarted).toBe(3);
    expect(leader.position).toBe(1);
  });

  it("sums the per-round figures exactly", () => {
    const wk = liveWeekend(EVENT);
    for (const row of wk.rows.filter(r => r.started)) {
      const sum = row.byRound.filter(Boolean).reduce((s, r) => s + r.netToPar, 0);
      expect(row.netToPar, row.player.name).toBe(sum);
    }
  });

  it("marks a player who played every round complete", () => {
    const wk = liveWeekend(EVENT);
    const played = wk.rows.filter(r => r.roundsStarted === 3);
    expect(played.length).toBe(11);
    expect(played.every(r => r.complete)).toBe(true);
  });

  it("does not assume three rounds", () => {
    // Pinehurst may not be three rounds; the maths must follow the data.
    const twoRounds = { ...EVENT, rounds: { 1: EVENT.rounds["1"], 2: EVENT.rounds["2"] } };
    const wk = liveWeekend(twoRounds);
    expect(wk.roundIds).toEqual(["1", "2"]);
    expect(wk.rows.find(r => r.started).roundsStarted).toBe(2);

    const four = { ...EVENT, rounds: { ...EVENT.rounds, 4: EVENT.rounds["1"] } };
    expect(liveWeekend(four).roundIds).toEqual(["1", "2", "3", "4"]);
  });

  it("copes with an empty event", () => {
    const wk = liveWeekend({ players: [], rounds: {}, courses: {} });
    expect(wk.rows).toEqual([]);
  });
});

describe("positionDelta", () => {
  const rows = (pairs) => pairs.map(([id, position]) => ({ player: { id }, position }));

  it("reports places gained as positive", () => {
    const d = positionDelta(rows([[1, 5]]), rows([[1, 2]]));
    expect(d[1]).toBe(3);
  });
  it("reports places lost as negative", () => {
    const d = positionDelta(rows([[1, 2]]), rows([[1, 6]]));
    expect(d[1]).toBe(-4);
  });
  it("is 0 for no change, a new player, or a player not yet started", () => {
    expect(positionDelta(rows([[1, 3]]), rows([[1, 3]]))[1]).toBe(0);
    expect(positionDelta(rows([]), rows([[9, 1]]))[9]).toBe(0);
    expect(positionDelta(rows([[1, 3]]), rows([[1, null]]))[1]).toBe(0);
  });
  it("handles missing input", () => {
    expect(positionDelta(null, rows([[1, 1]]))[1]).toBe(0);
    expect(positionDelta(rows([[1, 1]]), null)).toEqual({});
  });
});
