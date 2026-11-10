// ── One person holds the money ───────────────────────────────────────────────
// Karl collects every buy-in before the weekend, so settling up isn't players
// paying each other: it's the bank paying each player what they won, and
// collecting from anyone who ended up owing (birdie-pool losses bigger than
// their winnings). One line per player.
//
// What a player is owed is what they won — pots plus their birdie-pool balance.
// Their buy-in is already in the bank, so it isn't part of the payment.

const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** The settle-up from the bank's side. `rows` are settleWeekend(...).rows. */
export function bankerPlan(rows, bankerId, { paid = {} } = {}) {
  const banker = rows.find((r) => String(r.player.id) === String(bankerId))?.player || null;
  const lines = rows
    .filter((r) => String(r.player.id) !== String(bankerId))
    .map((r) => {
      const kind = r.won > 0 ? "pay" : r.won < 0 ? "request" : "square";
      const key = `bank_${r.player.id}_${Math.round(cents(r.won) * 100)}`;
      return { key, player: r.player, kind, amount: cents(Math.abs(r.won)), done: !!paid?.[key] };
    })
    .sort((a, b) => order(a) - order(b) || b.amount - a.amount || a.player.name.localeCompare(b.player.name));

  const payOut = lines.filter((l) => l.kind === "pay").reduce((t, l) => t + l.amount, 0);
  const collect = lines.filter((l) => l.kind === "request").reduce((t, l) => t + l.amount, 0);
  const collected = rows.reduce((t, r) => t + (r.staked || 0), 0);
  return {
    banker,
    lines,
    totals: {
      collected,                                  // buy-ins in the bank before settling
      payOut: cents(payOut),
      collect: cents(collect),
      keeps: cents(collected - payOut + collect), // what the bank holds when it's all done
    },
    done: lines.filter((l) => l.kind !== "square" && l.done).length,
    toDo: lines.filter((l) => l.kind !== "square").length,
  };
}

// Payments first, then collections, then anyone who's square.
const order = (l) => (l.kind === "pay" ? 0 : l.kind === "request" ? 1 : 2);
