// ── Showing a handicap index ──────────────────────────────────────────────────
// An index can be blank — a new player, or a field wiped for reassessment — and
// `p.hcpIndex.toFixed(1)` throws on one, which took down the Players tab: the
// very screen you'd open to fill it in.

/** "10.3", "0.0" for scratch, a dash when there isn't one. */
export function fmtIndex(v, missing = "—") {
  if (v == null || v === "") return missing;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) : missing;
}
