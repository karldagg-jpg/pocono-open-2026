// ── Handicap ──────────────────────────────────────────────────────────────────
export function courseHandicap(index, slope, rating, totalPar) {
  return Math.round(index * (slope / 113) + (rating - totalPar));
}

export function strokesOnHole(courseHcp, holeSI) {
  if (courseHcp <= 0) return 0;
  let strokes = Math.floor(Math.abs(courseHcp) / 18) * Math.sign(courseHcp);
  const remainder = Math.abs(courseHcp) % 18;
  if (courseHcp > 0 && holeSI <= remainder) strokes++;
  if (courseHcp < 0 && holeSI <= remainder) strokes--;
  return strokes;
}

export function netHole(gross, courseHcp, holeSI) {
  return gross - strokesOnHole(courseHcp, holeSI);
}

export function totalPar(course) {
  return course.par.reduce((a, b) => a + b, 0);
}

export function playerCourseHcp(player, course) {
  const tp = totalPar(course);
  const slope = course.slope || 113;
  const rating = course.rating || tp;
  return courseHandicap(player.hcpIndex, slope, rating, tp);
}

// Default: use rounded index directly (no slope/rating conversion).
// useIndex=false falls back to USGA course handicap formula.
export function getEffectiveHcp(player, course, useIndex = true) {
  if (useIndex) return Math.round(player.hcpIndex);
  return playerCourseHcp(player, course);
}

// ── Scats / Skins ─────────────────────────────────────────────────────────────
// Priority per hole: gross HIO > gross eagle > gross birdie > net birdie+.
// Ties at any level carry to the next hole. No net score wins unless there is
// at least a net birdie (netToPar <= -1) and no gross birdie/eagle/HIO exists.
export function calcScatts(roundScores, course, players, buyIn, useIndex = true) {
  const totalPot = players.length * buyIn;
  const holeWinners = {};
  const holeResults = [];
  let totalScatts = 0;
  let carry = 0;

  for (let h = 0; h < 18; h++) {
    const par = course.par[h];
    const si  = course.si[h];

    const entries = players.map(p => {
      const ps = roundScores[p.id];
      if (!ps || !ps[h]) return null;
      const gross = ps[h];
      const chcp = getEffectiveHcp(p, course, useIndex);
      const net = gross - strokesOnHole(chcp, si);
      const grossToPar = gross - par;
      const netToPar   = net   - par;

      let tier;
      if (gross === 1)            tier = 0; // HIO
      else if (grossToPar <= -2)  tier = 1; // eagle or better
      else if (grossToPar === -1) tier = 2; // birdie
      else                         tier = 3; // net comparison

      return { id: p.id, name: p.name, gross, net, grossToPar, netToPar, tier };
    }).filter(Boolean);

    if (!entries.length) {
      holeResults.push({ hole: h + 1, winner: null, push: false, carry });
      carry++;
      continue;
    }

    const bestTier = Math.min(...entries.map(e => e.tier));
    const candidates = entries.filter(e => e.tier === bestTier);

    let winner = null, push = false, tied = null, type = null;

    if (bestTier < 3) {
      const bestGross = Math.min(...candidates.map(e => e.gross));
      const winners = candidates.filter(e => e.gross === bestGross);
      if (winners.length === 1) {
        winner = winners[0];
        type = bestTier === 0 ? 'hio' : bestTier === 1 ? 'eagle' : 'birdie';
      } else {
        push = true; tied = winners;
      }
    } else {
      // Net: only net birdie or better (netToPar <= -1) qualifies
      const netBirdies = entries.filter(e => e.netToPar <= -1);
      if (!netBirdies.length) {
        push = true;
      } else {
        const best = Math.min(...netBirdies.map(e => e.netToPar));
        const winners = netBirdies.filter(e => e.netToPar === best);
        if (winners.length === 1) {
          winner = winners[0]; type = 'net';
        } else {
          push = true; tied = winners;
        }
      }
    }

    if (winner) {
      const holesWon = carry + 1;
      holeWinners[winner.id] = (holeWinners[winner.id] || 0) + holesWon;
      totalScatts += holesWon;
      holeResults.push({ hole: h + 1, winner, net: winner.net, gross: winner.gross, type, push: false, carry, holesWon });
      carry = 0;
    } else {
      holeResults.push({ hole: h + 1, winner: null, push: true, tied, carry });
      carry++;
    }
  }

  const scattValue = totalScatts > 0 ? totalPot / totalScatts : 0;
  return { holeWinners, totalScatts, scattValue, totalPot, holeResults };
}

// ── Birdie / Eagle / HIO Pool ─────────────────────────────────────────────────
// Gross only. Each scorer collects from every other gambling player.
// Birdie $1 · Eagle $5 · HIO $10 (HIO supersedes eagle — pays $10 only).
export function calcBirdiePool(roundScores, course, players) {
  const RATES = { birdie: 1, eagle: 5, hio: 10 };
  const holesDetail = [];
  const earned = Object.fromEntries(players.map(p => [p.id, 0]));
  const owed   = Object.fromEntries(players.map(p => [p.id, 0]));

  for (let h = 0; h < 18; h++) {
    const par = course.par[h];
    const events = [];

    for (const scorer of players) {
      const ps = roundScores[scorer.id];
      if (!ps || !ps[h]) continue;
      const gross = ps[h];
      const toPar = gross - par;

      let type, rate;
      if (gross === 1)       { type = 'hio';    rate = RATES.hio; }
      else if (toPar <= -2)  { type = 'eagle';  rate = RATES.eagle; }
      else if (toPar === -1) { type = 'birdie'; rate = RATES.birdie; }
      else continue;

      const others = players.filter(p => p.id !== scorer.id);
      const payout = rate * others.length;
      earned[scorer.id] += payout;
      others.forEach(p => { owed[p.id] += rate; });
      events.push({ scorerId: scorer.id, scorerName: scorer.name, type, gross, par, rate, payout });
    }

    if (events.length) holesDetail.push({ hole: h + 1, events });
  }

  const netBalance = Object.fromEntries(players.map(p => [p.id, earned[p.id] - owed[p.id]]));
  return { holesDetail, earned, owed, netBalance };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function gamblingPlayers(event) {
  const { players = [], optOuts = [] } = event;
  const out = new Set(optOuts);
  return players.filter(p => !out.has(p.id));
}

// ── Net leaderboard ──────────────────────────────────────────────────────────
export function calcLeaderboard(event) {
  const { players = [], courses = {}, rounds = {}, games = {} } = event;
  if (!players.length) return [];
  const useIndex = games?.useIndexHcp !== false;

  return players
    .map(p => {
      const roundNets = [], roundGross = [];
      [1, 2, 3].forEach(rNum => {
        const round = rounds[rNum];
        if (!round) { roundNets.push(null); roundGross.push(null); return; }
        const course = courses[round.courseId];
        if (!course) { roundNets.push(null); roundGross.push(null); return; }
        const scores = (round.scores || {})[p.id];
        if (!scores || scores.filter(Boolean).length < 18) { roundNets.push(null); roundGross.push(null); return; }
        const chcp  = getEffectiveHcp(p, course, useIndex);
        const gross = scores.reduce((a, b) => a + (b || 0), 0);
        roundNets.push(gross - chcp);
        roundGross.push(gross);
      });

      const completedNets  = roundNets.filter(n => n !== null);
      const completedGross = roundGross.filter(g => g !== null);
      return {
        player: p, roundNets, roundGross,
        total:      completedNets.length  ? completedNets.reduce((a, b)  => a + b, 0) : null,
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
export function calcLowNet(event) {
  const { games = {} } = event;
  const cfg  = games.lowNet || {};
  const pot  = cfg.pot || 0;
  const pcts = cfg.payoutPcts || [50, 30, 20];
  const players = gamblingPlayers(event);
  if (!pot || !players.length) return { payouts: {}, positions: [], pot };

  const board    = calcLeaderboard(event).filter(r => players.some(p => p.id === r.player.id));
  const finished = board.filter(r => r.roundsPlayed >= (cfg.minRounds || 3));
  if (!finished.length) return { payouts: {}, positions: [], pot };

  const positions = [];
  let i = 0;
  while (i < finished.length) {
    const total = finished[i].total;
    const group = [];
    while (i < finished.length && finished[i].total === total) { group.push(finished[i]); i++; }
    positions.push(group);
  }

  const prizes = pcts.map(pct => Math.round((pot * pct) / 100));
  const payouts = {};
  players.forEach(p => { payouts[p.id] = 0; });

  let slotIdx = 0;
  positions.forEach(group => {
    const combined = prizes.slice(slotIdx, slotIdx + group.length).reduce((a, b) => a + b, 0);
    const share = Math.round(combined / group.length);
    group.forEach(r => { payouts[r.player.id] = share; });
    slotIdx += group.length;
  });

  return { payouts, positions, pot, pcts, prizes };
}

// ── CTP ──────────────────────────────────────────────────────────────────────
export function calcCTP(event) {
  const { games = {} } = event;
  const players    = gamblingPlayers(event);
  const cfg        = games.ctp || {};
  const pot        = cfg.pot || 0;
  const ctpResults = cfg.results || {};
  if (!pot) return { payouts: {}, totalWins: {} };

  const payouts = {}, totalWins = {};
  players.forEach(p => { payouts[p.id] = 0; totalWins[p.id] = 0; });

  let totalHoles = 0;
  Object.values(ctpResults).forEach(rr => {
    Object.values(rr).forEach(pid => {
      if (pid && payouts[pid] !== undefined) { totalWins[pid]++; totalHoles++; }
    });
  });

  const perWin = totalHoles > 0 ? Math.round(pot / totalHoles) : 0;
  Object.entries(totalWins).forEach(([pid, wins]) => { payouts[Number(pid)] = wins * perWin; });

  return { payouts, totalWins, pot, perWin, ctpResults };
}

// ── Winnings ─────────────────────────────────────────────────────────────────
export function calcWinnings(event) {
  const { courses = {}, rounds = {}, games = {}, buyIn = 100, weekendBuyIn } = event;
  const players  = gamblingPlayers(event);
  const useIndex = games?.useIndexHcp !== false;
  const winnings = {};
  players.forEach(p => { winnings[p.id] = { scatts: 0, lowNet: 0, ctp: 0, total: 0 }; });

  const scattsBuyIn = games.scatts?.enabled && games.scatts?.pot
    ? games.scatts.pot / 3 / Math.max(players.length, 1)
    : weekendBuyIn ? weekendBuyIn / 3 : buyIn;

  [1, 2, 3].forEach(rNum => {
    const round = rounds[rNum];
    if (!round) return;
    const course = courses[round.courseId];
    if (!course) return;
    const hasScores = players.some(p => (round.scores || {})[p.id]?.filter(Boolean).length > 0);
    if (!hasScores) return;
    const { holeWinners, scattValue } = calcScatts(round.scores || {}, course, players, scattsBuyIn, useIndex);
    Object.entries(holeWinners).forEach(([pid, scatts]) => {
      const id = Number(pid);
      if (winnings[id]) winnings[id].scatts += Math.round(scatts * scattValue);
    });
  });

  const { payouts: lnPayouts } = calcLowNet(event);
  Object.entries(lnPayouts).forEach(([pid, amt]) => {
    const id = Number(pid);
    if (winnings[id]) winnings[id].lowNet = amt;
  });

  const { payouts: ctpPayouts } = calcCTP(event);
  Object.entries(ctpPayouts).forEach(([pid, amt]) => {
    const id = Number(pid);
    if (winnings[id]) winnings[id].ctp = amt;
  });

  players.forEach(p => {
    if (winnings[p.id]) winnings[p.id].total = winnings[p.id].scatts + winnings[p.id].lowNet + winnings[p.id].ctp;
  });

  return winnings;
}

// ── Auto-pairings for round 3 ─────────────────────────────────────────────────
export function autoPairRound3(event) {
  const board = calcLeaderboard(event);
  const sorted = board
    .filter(r => r.roundsPlayed >= 1)
    .sort((a, b) => {
      if (a.total === null) return 1;
      if (b.total === null) return -1;
      return a.total - b.total;
    });

  const groups = { 0: [], 1: [], 2: [] };
  sorted.forEach((r, i) => groups[Math.floor(i / 4)].push(r.player.id));
  return groups;
}
