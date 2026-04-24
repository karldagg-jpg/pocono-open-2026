// ── Test data for Pocono Open 2026 ───────────────────────────────────────────
// Generates a full realistic event: 12 players, 3 courses, scores for R1 & R2.

// Deterministic pseudo-random (no external deps, always same output)
function rand(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// Score distribution by handicap index — higher hcp = more bogeys/doubles
function genScore(par, hcpIndex, seed) {
  const r = rand(seed);
  const birdie = Math.max(0.02, 0.10 - hcpIndex * 0.003);
  const parChance = Math.max(0.10, 0.40 - hcpIndex * 0.012);
  const bogey = 0.35;
  const dbl = 0.18;
  if (r < birdie)                            return par - 1;
  if (r < birdie + parChance)                return par;
  if (r < birdie + parChance + bogey)        return par + 1;
  if (r < birdie + parChance + bogey + dbl)  return par + 2;
  return par + 3;
}

// ── Players ──────────────────────────────────────────────────────────────────
const PLAYERS = [
  { id: 1,  name: "Karl Dagg",       hcpIndex: 8.4  },
  { id: 2,  name: "Mike Thompson",   hcpIndex: 12.1 },
  { id: 3,  name: "Dave Sullivan",   hcpIndex: 3.2  },
  { id: 4,  name: "Chris Reilly",    hcpIndex: 18.7 },
  { id: 5,  name: "Tom Brady",       hcpIndex: 6.8  },
  { id: 6,  name: "Jim Walsh",       hcpIndex: 15.3 },
  { id: 7,  name: "Pat O'Brien",     hcpIndex: 22.4 },
  { id: 8,  name: "Steve Morris",    hcpIndex: 10.5 },
  { id: 9,  name: "Rich Caruso",     hcpIndex: 0.9  },
  { id: 10, name: "Dan Feeney",      hcpIndex: 7.2  },
  { id: 11, name: "Bob Kelley",      hcpIndex: 14.6 },
  { id: 12, name: "Frank DiMeo",     hcpIndex: 19.1 },
];

// ── Courses ──────────────────────────────────────────────────────────────────
// Each par array sums to 72; each si array contains exactly 1–18.
const COURSES = {
  1: {
    name: "Pocono Manor (Lake Course)",
    slope: 126, rating: 71.8,
    par: [4,3,5,4,4,3,4,5,4, 4,3,5,4,4,3,4,5,4],
    si:  [7,17,3,13,1,15,9,5,11, 8,18,4,14,2,16,10,6,12],
    // Par 3s at indices: 1, 5, 10, 14
  },
  2: {
    name: "Pocono Manor (Mountain Course)",
    slope: 130, rating: 72.4,
    par: [4,5,3,4,4,3,4,5,4, 4,5,3,4,4,3,4,5,4],
    si:  [5,9,17,1,11,15,7,3,13, 6,10,18,2,12,16,8,4,14],
    // Par 3s at indices: 2, 5, 11, 14
  },
  3: {
    name: "Buck Hill Falls CC",
    slope: 121, rating: 70.5,
    par: [5,4,3,4,4,5,3,4,4, 5,4,3,4,4,5,3,4,4],
    si:  [3,11,17,7,1,13,15,5,9, 4,12,18,8,2,14,16,6,10],
    // Par 3s at indices: 2, 6, 11, 15
  },
};

// ── Build event ──────────────────────────────────────────────────────────────
export function buildTestEvent() {
  const rounds = {};

  // Rounds 1 & 2: complete scores for all players
  [1, 2].forEach((rNum) => {
    const course = COURSES[rNum];
    const scores = {};
    PLAYERS.forEach((p, pi) => {
      scores[p.id] = course.par.map((par, h) =>
        genScore(par, p.hcpIndex, pi * 541 + rNum * 97 + h * 13)
      );
    });
    rounds[rNum] = { courseId: rNum, scores };
  });

  // Round 3: course assigned but only first group has entered through hole 9
  const course3 = COURSES[3];
  const r3scores = {};
  // Group 1 players (ids 1,3,9,10 — top of leaderboard after 2 rounds) scored front 9
  [1, 3, 9, 10].forEach((pid, pi) => {
    const p = PLAYERS.find((pl) => pl.id === pid);
    const partial = course3.par.map((par, h) =>
      h < 9 ? genScore(par, p.hcpIndex, pi * 311 + 3 * 97 + h * 13) : 0
    );
    r3scores[pid] = partial;
  });
  rounds[3] = { courseId: 3, scores: r3scores };

  // Firestore doesn't support nested arrays — groups stored as object { 0: [...], 1: [...], 2: [...] }
  const pairings = {
    1: { 0: [1, 2, 3, 4],    1: [5, 6, 7, 8],    2: [9, 10, 11, 12] },
    2: { 0: [9, 10, 11, 12], 1: [1, 2, 3, 4],    2: [5, 6, 7, 8]    },
    3: { 0: [1, 3, 9, 10],   1: [5, 8, 2, 11],   2: [4, 6, 7, 12]   },
  };

  const weekendBuyIn = 200;
  const games = {
    scatts: { enabled: true, pot: 900 },
    lowNet: { enabled: true, pot: 1200, payoutPcts: [50, 30, 20] },
    ctp: {
      enabled: true,
      pot: 300,
      // Hole indices (0-based) that are CTP holes this round
      holes: {
        1: [1, 5],    // Course 1 par 3s: holes 2 & 6
        2: [2, 5],    // Course 2 par 3s: holes 3 & 6
        3: [2, 6],    // Course 3 par 3s: holes 3 & 7
      },
      // CTP winners by { roundNum: { holeIdx: playerId } }
      results: {
        1: { 1: 9, 5: 3 },    // R1: Rich wins hole 2, Dave wins hole 6
        2: { 2: 5, 5: 1 },    // R2: Tom wins hole 3, Karl wins hole 6
      },
    },
  };

  return {
    name: "Pocono Open 2026",
    players: PLAYERS,
    courses: COURSES,
    rounds,
    pairings,
    weekendBuyIn,
    games,
    optOuts: [],
    buyIn: 100,
  };
}
