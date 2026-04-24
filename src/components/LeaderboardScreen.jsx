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

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "22px 14px" }}>
      <div style={{ fontFamily: FD, fontSize: "28px", fontWeight: 600, color: CREAM, marginBottom: "4px" }}>
        Leaderboard
      </div>
      <div style={{ color: M, fontSize: "14px", marginBottom: "18px" }}>
        Net scores · 3 rounds · Low total wins
      </div>

      <div style={{ background: CARD2, border: `1px solid rgba(201,168,76,0.15)`, borderRadius: "12px", overflow: "clip" }}>
        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "72vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "480px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid rgba(201,168,76,0.25)` }}>
                {["#", "Player", "HCP", "R1", "R2", "R3", "Total"].map((h, i) => (
                  <td key={i} style={{
                    padding: "9px 10px", color: M, textAlign: i >= 3 ? "center" : "left",
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
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid rgba(201,168,76,0.1)` }}>
                    <td style={{ padding: "10px 10px", fontWeight: 700, color: rc, fontSize: "13px" }}>{rank}</td>
                    <td style={{ padding: "10px 10px" }}>
                      <div style={{ fontSize: "14px", color: rank <= 3 ? CREAM : M, fontWeight: rank <= 3 ? 600 : 400 }}>{p.name}</div>
                    </td>
                    <td style={{ padding: "10px 10px", color: GOLD, fontSize: "13px" }}>{p.hcpIndex.toFixed(1)}</td>
                    {[0, 1, 2].map((ri) => {
                      const net = row.roundNets[ri];
                      const par = coursePar(ri + 1);
                      const diff = net !== null && par ? net - par : null;
                      return (
                        <td key={ri} style={{ padding: "10px 10px", textAlign: "center" }}>
                          {net !== null ? (
                            <span style={{ color: diff < 0 ? R : diff === 0 ? G : M, fontWeight: diff < 0 ? 700 : 400, fontSize: "13px" }}>
                              {net}
                            </span>
                          ) : (
                            <span style={{ color: M, fontSize: "12px" }}>—</span>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ padding: "10px 10px", textAlign: "center", fontWeight: 700, fontSize: "14px", color: row.total !== null ? rc : M }}>
                      {row.total !== null ? row.total : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 14px", borderTop: `1px solid rgba(255,255,255,0.06)`, fontSize: "12px", color: M }}>
          Net = Gross − Course Handicap (USGA) · Red = under par
        </div>
      </div>
    </div>
  );
}
