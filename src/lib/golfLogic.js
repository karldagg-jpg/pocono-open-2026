// ── Course handicap ──────────────────────────────────────────────────────────
// USGA formula: round(index × slope/113 + (rating − par))
export function courseHandicap(index, slope, rating, totalPar) {
  return Math.round(index * (slope / 113) + (rating - totalPar));
}

// Strokes received on a single hole given a course handicap and that hole's SI
export function strokesOnHole(courseHcp, holeSI) {
  if (courseHcp <= 0) return 0;
  let strokes = Math.floor(Math.abs(courseHcp) / 18) * Math.sign(courseHcp);
  const remainder = Math.abs(courseHcp) % 18;
  if (courseHcp > 0 && holeSI <= remainder) strokes++;
  if (courseHcp < 0 && holeSI <= remainder) strokes--;
  return strokes;
}

// Net score on a hole
export function netHole(gross, courseHcp, holeSI) {
  return gross - strokesOnHole(courseHcp, holeSI);
}

// Total par for a course
export function totalPar(course) {
  return course.par.reduce((a, b) => a + b, 0);
}

// Course handicap for a player on a specific course
export function playerCourseHcp(player, course) {
  return courseHandicap(player.hcpIndex, course.slope, course.rating, totalPar(course));
}

// ── Scatts ───────────────────────────────────────────────────────────────────
// Returns { holeWinners: {pid: scatts}, totalScatts, scattValue, holeResults: [{hole, winner, net}] }
// No carryover — pushed holes are simply not won
export function calcScatts(roundScores, course, players, buyIn) {
  const totalPot = players.length * buyIn;
  const holeWinners = {};
  const holeResults = [];
  let totalScatts = 0;

  for (let h = 0; h < 18; h++) {
    const nets = players
      .map((p) => {
        const scores = roundScores[p.id];
        if (!scores || !scores[h]) return null;
        const chcp = playerCourseHcp(p, course);
        return { id: p.id, name: p.name, net: netHole(scores[h], chcp, course.si[h]), gross: scores[h] };
      })
      .filter(Boolean);

    if (nets.length === 0) {
      holeResults.push({ hole: h + 1, winner: null, net: null, push: false });
      continue;
    }

    const minNet = Math.min(...nets.map((n) => n.net));
    const winners = nets.filter((n) => n.net === minNet);

    if (winners.length === 1) {
      const pid = winners[0].id;
      holeWinners[pid] = (holeWinners[pid] || 0) + 1;
      totalScatts++;
      holeResults.push({ hole: h + 1, winner: winners[0], net: minNet, push: false });
    } else {
      holeResults.push({ hole: h + 1, winner: null, net: minNet, push: true, tied: winners });
    }
  }

  const scattValue = totalScatts > 0 ? totalPot / totalScatts : 0;
  return { holeWinners, totalScatts, scattValue, totalPot, holeResults };
}

// ── Net leaderboard ──────────────────────────────────────────────────────────
// Returns sorted array of { player, roundNets: [net1, net2, net3], total, roundGross, totalGross }
export function calcLeaderboard(event) {
  const { players = [], courses = {}, rounds = {} } = event;
  if (!players.length) return [];

  return players
    .map((p) => {
      const roundNets = [];
      const roundGross = [];
      [1, 2, 3].forEach((rNum) => {
        const round = rounds[rNum];
        if (!round) { roundNets.push(null); roundGross.push(null); return; }
        const course = courses[round.courseId];
        if (!course) { roundNets.push(null); roundGross.push(null); return; }
        const scores = (round.scores || {})[p.id];
        if (!scores || scores.filter(Boolean).length < 18) { roundNets.push(null); roundGross.push(null); return; }
        const chcp = playerCourseHcp(p, course);
        const gross = scores.reduce((a, b) => a + (b || 0), 0);
        const net = gross - chcp;
        roundNets.push(net);
        roundGross.push(gross);
      });

      const completedNets = roundNets.filter((n) => n !== null);
      const completedGross = roundGross.filter((g) => g !== null);
      return {
        player: p,
        roundNets,
        roundGross,
        total: completedNets.length ? completedNets.reduce((a, b) => a + b, 0) : null,
        totalGross: completedGross.length ? completedGross.reduce((a, b) => a + b, 0) : null,
        roundsPlayed: completedNets.length,
      };
    })
    .sort((a, b) => {
      if (a.total === null && b.total === null) return 0;
      if (a.total === null) return 1;
      if (b.total === null) return -1;
      return a.total - b.total;
    });
}

// ── Low Net payout ───────────────────────────────────────────────────────────
// payoutPcts: e.g. [50, 30, 20] — must sum to 100
// Ties: tied players split the combined prize money for the positions they occupy
export function calcLowNet(event) {
  const { players = [], games = {} } = event;
  const cfg = games.lowNet || {};
  const pot = cfg.pot || 0;
  const pcts = cfg.payoutPcts || [50, 30, 20];
  if (!pot || !players.length) return { payouts: {}, positions: [], pot };

  const board = calcLeaderboard(event);
  // Only players who completed all rounds
  const finished = board.filter((r) => r.roundsPlayed >= (cfg.minRounds || 3));
  if (!finished.length) return { payouts: {}, positions: [], pot };

  // Group into tied positions
  const positions = [];
  let i = 0;
  while (i < finished.length) {
    const total = finished[i].total;
    const group = [];
    while (i < finished.length && finished[i].total === total) {
      group.push(finished[i]);
      i++;
    }
    positions.push(group);
  }

  // Calculate prize for each position slot
  const prizes = pcts.map((pct) => Math.round((pot * pct) / 100));

  const payouts = {};
  players.forEach((p) => { payouts[p.id] = 0; });

  let slotIdx = 0;
  positions.forEach((group) => {
    const slots = group.length;
    // Sum up prizes for the slots this group occupies
    const combined = prizes.slice(slotIdx, slotIdx + slots).reduce((a, b) => a + b, 0);
    const share = Math.round(combined / slots);
    group.forEach((r) => { payouts[r.player.id] = share; });
    slotIdx += slots;
    if (slotIdx >= pcts.length) return; // no more prize positions
  });

  return { payouts, positions, pot, pcts, prizes };
}

// ── CTP (Closest to Pin) ─────────────────────────────────────────────────────
// ctpResults: { [roundNum]: { [holeIdx]: playerId } }
// Returns per-player payout
export function calcCTP(event) {
  const { players = [], games = {} } = event;
  const cfg = games.ctp || {};
  const pot = cfg.pot || 0;
  const ctpResults = cfg.results || {}; // { roundNum: { holeIdx: playerId } }
  if (!pot) return { payouts: {}, totalWins: {} };

  const payouts = {};
  const totalWins = {};
  players.forEach((p) => { payouts[p.id] = 0; totalWins[p.id] = 0; });

  // Count total wins across all rounds and holes
  let totalHoles = 0;
  Object.values(ctpResults).forEach((roundResult) => {
    Object.values(roundResult).forEach((pid) => {
      if (pid && payouts[pid] !== undefined) {
        totalWins[pid]++;
        totalHoles++;
      }
    });
  });

  const perWin = totalHoles > 0 ? Math.round(pot / totalHoles) : 0;
  Object.entries(totalWins).forEach(([pid, wins]) => {
    payouts[Number(pid)] = wins * perWin;
  });

  return { payouts, totalWins, pot, perWin, ctpResults };
}

// ── Winnings ─────────────────────────────────────────────────────────────────
export function calcWinnings(event) {
  const { players = [], courses = {}, rounds = {}, games = {}, buyIn = 100, weekendBuyIn } = event;
  const winnings = {};
  players.forEach((p) => { winnings[p.id] = { scatts: 0, lowNet: 0, ctp: 0, total: 0 }; });

  // Scatts per-round buy-in: allocated pot ÷ 3 rounds ÷ players, else weekendBuyIn÷3, else legacy buyIn
  const scattsBuyIn = games.scatts?.enabled && games.scatts?.pot
    ? games.scatts.pot / 3 / Math.max(players.length, 1)
    : weekendBuyIn
    ? weekendBuyIn / 3
    : buyIn;

  [1, 2, 3].forEach((rNum) => {
    const round = rounds[rNum];
    if (!round) return;
    const course = courses[round.courseId];
    if (!course) return;
    const hasScores = players.some((p) => (round.scores || {})[p.id]?.filter(Boolean).length > 0);
    if (!hasScores) return;
    const { holeWinners, scattValue } = calcScatts(round.scores || {}, course, players, scattsBuyIn);
    Object.entries(holeWinners).forEach(([pid, scatts]) => {
      const id = Number(pid);
      if (winnings[id]) winnings[id].scatts += Math.round(scatts * scattValue);
    });
  });

  // Low Net payout
  const { payouts: lnPayouts } = calcLowNet(event);
  Object.entries(lnPayouts).forEach(([pid, amt]) => {
    const id = Number(pid);
    if (winnings[id]) winnings[id].lowNet = amt;
  });

  // CTP payout
  const { payouts: ctpPayouts } = calcCTP(event);
  Object.entries(ctpPayouts).forEach(([pid, amt]) => {
    const id = Number(pid);
    if (winnings[id]) winnings[id].ctp = amt;
  });

  players.forEach((p) => {
    if (winnings[p.id]) {
      winnings[p.id].total = winnings[p.id].scatts + winnings[p.id].lowNet + winnings[p.id].ctp;
    }
  });

  return winnings;
}

// ── Auto-pairings for round 3 ────────────────────────────────────────────────
// Sort by net score after 2 rounds, group into foursomes
export function autoPairRound3(event) {
  const board = calcLeaderboard(event);
  const sorted = board
    .filter((r) => r.roundsPlayed >= 1)
    .sort((a, b) => {
      if (a.total === null) return 1;
      if (b.total === null) return -1;
      return a.total - b.total;
    });

  const groups = [[], [], []];
  sorted.forEach((r, i) => groups[Math.floor(i / 4)].push(r.player.id));
  return groups;
}
