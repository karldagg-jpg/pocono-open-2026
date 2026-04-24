import { CARD2, CREAM, G, GO, GOLD, M, R, FD, FB } from "../constants/theme";
import { calcLeaderboard, playerCourseHcp, totalPar } from "../lib/golfLogic";

export default function LeaderboardScreen({ event }) {
  const { courses = {}, rounds = {} } = event;
  const board = calcLeaderboard(event);

  function coursePar(rNum) {
    const round = rounds[rNum];
    if (!round) return null;
    const course = courses[round.courseId];
    return course ? totalPar(course) : null;
  }

  // Calculate total par across all played rounds for each player
  function totalParPlayed(row) {
    let tp = 0;
    [1, 2, 3].forEach((rNum, ri) => {
      if (row.roundNets[ri] !== null) {
        const par = coursePar(rNum);
        if (par) tp += par;
      }
    });
    return tp;
  }

  // Build previous round rankings for movement arrows
  // After round N, compare position to what it was after round N-1
  const maxRound = [3, 2, 1].find((r) => board.some((row) => row.roundNets[r - 1] !== null)) || 0;
  let prevRanks = {};
  if (maxRound >= 2) {
    // Simulate leaderboard with only rounds up to maxRound-1
    const prevBoard = board
      .map((row) => {
        const nets = row.roundNets.slice(0, maxRound - 1);
        const completed = nets.filter((n) => n !== null);
        return {
          id: row.player.id,
          total: completed.length ? completed.reduce((a, b) => a + b, 0) : null,
        };
      })
      .filter((r) => r.total !== null)
      .sort((a, b) => a.total - b.total);
    prevBoard.forEach((r, i) => { prevRanks[r.id] = i + 1; });
  }

  function formatDiff(diff) {
    if (diff === 0) return "E";
    if (diff > 0) return `+${diff}`;
    return String(diff);
  }

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        Leaderboard
      </div>
      <div style={{ color: M, fontSize: "14px", marginBottom: "18px" }}>
        Net scores · 3 rounds · Low total wins
      </div>

      <div className="card2">
        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "72vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "520px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid rgba(201,168,76,0.25)` }}>
                {["#", "", "Player", "HCP", "R1", "R2", "R3", "Total", "+/−"].map((h, i) => (
                  <td key={i} style={{
                    padding: "9px 8px", color: M, textAlign: i >= 4 ? "center" : "left",
                    fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase",
                    position: "sticky", top: 0, background: CARD2, borderBottom: `1px solid rgba(201,168,76,0.25)`,
                    fontWeight: 600,
                  }}>{h}</td>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.map((row, idx) => {
                const rank = idx + 1;
                const rc = rank === 1 ? GO : rank === 2 ? "#c0a060" : rank === 3 ? G : CREAM;
                const p = row.player;
                const tp = totalParPlayed(row);
                const totalDiff = row.total !== null && tp ? row.total - tp : null;

                // Movement indicator
                const prevRank = prevRanks[p.id];
                let moveIcon = null;
                let moveColor = M;
                if (prevRank && row.total !== null) {
                  const diff = prevRank - rank;
                  if (diff > 0) { moveIcon = `▲${diff}`; moveColor = G; }
                  else if (diff < 0) { moveIcon = `▼${Math.abs(diff)}`; moveColor = R; }
                  else { moveIcon = "—"; }
                }

                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid rgba(201,168,76,0.1)` }}>
                    <td style={{ padding: "10px 8px", fontWeight: 700, color: rc, fontSize: "13px", width: "28px" }}>{rank}</td>
                    <td style={{ padding: "10px 4px", fontSize: "11px", color: moveColor, width: "32px" }}>
                      {moveIcon}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontSize: "14px", color: rank <= 3 ? CREAM : M, fontWeight: rank <= 3 ? 600 : 400 }}>{p.name}</div>
                    </td>
                    <td style={{ padding: "10px 8px", color: GOLD, fontSize: "13px" }}>{p.hcpIndex.toFixed(1)}</td>
                    {[0, 1, 2].map((ri) => {
                      const net = row.roundNets[ri];
                      const par = coursePar(ri + 1);
                      const diff = net !== null && par ? net - par : null;
                      return (
                        <td key={ri} style={{ padding: "10px 8px", textAlign: "center" }}>
                          {net !== null ? (
                            <div>
                              <span style={{ color: diff < 0 ? R : diff === 0 ? G : M, fontWeight: diff < 0 ? 700 : 400, fontSize: "13px" }}>
                                {net}
                              </span>
                              <div style={{ fontSize: "10px", color: diff < 0 ? R : diff === 0 ? G : M, opacity: 0.8 }}>
                                {formatDiff(diff)}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: M, fontSize: "12px" }}>—</span>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, fontSize: "14px", color: row.total !== null ? rc : M }}>
                      {row.total !== null ? row.total : "—"}
                    </td>
                    <td style={{
                      padding: "10px 8px", textAlign: "center", fontSize: "13px", fontWeight: 700,
                      color: totalDiff !== null
                        ? (totalDiff < 0 ? R : totalDiff === 0 ? G : M)
                        : M,
                    }}>
                      {totalDiff !== null ? formatDiff(totalDiff) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 14px", borderTop: `1px solid rgba(255,255,255,0.06)`, fontSize: "12px", color: M }}>
          Net = Gross − Course Handicap (USGA) · Red = under par · Arrows show movement from previous round
        </div>
      </div>
    </div>
  );
}
