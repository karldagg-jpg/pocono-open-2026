import { describe, it, expect } from "vitest";
import { holeComplete, firstOpenHole, autoAdvanceAction, holesDone } from "../src/lib/scoringFlow.js";
import { createPendingWrites, waitingLabel } from "../src/lib/pendingWrites.js";

const G = [1, 2, 3, 4];
// Cards filled for the first n holes.
const through = (n, ids = G) => Object.fromEntries(ids.map((id) => [id, Array.from({ length: 18 }, (_, h) => (h < n ? 4 : 0))]));

describe("holeComplete", () => {
  it("needs every player in the group", () => {
    const s = through(3);
    expect(holeComplete(G, s, 2)).toBe(true);
    s[4][2] = 0;
    expect(holeComplete(G, s, 2)).toBe(false);
  });

  it("isn't complete with nobody in the group", () => {
    expect(holeComplete([], {}, 0)).toBe(false);
  });

  it("ignores players outside the group", () => {
    const s = { ...through(5), 9: Array(18).fill(0) };
    expect(holeComplete(G, s, 4)).toBe(true);
  });
});

describe("firstOpenHole — where to pick up", () => {
  it("starts a fresh round on hole 1", () => {
    expect(firstOpenHole(G, {})).toBe(0);
  });

  it("picks up after the last finished hole", () => {
    expect(firstOpenHole(G, through(11))).toBe(11);   // hole 12
  });

  it("stops on a hole someone skipped, even with later holes done", () => {
    const s = through(9); s[3][4] = 0;
    expect(firstOpenHole(G, s)).toBe(4);
  });

  it("comes back to the 18th once the round is done", () => {
    expect(firstOpenHole(G, through(18))).toBe(17);
  });
});

describe("autoAdvanceAction — moving on by itself", () => {
  const before = through(6); before[4][6] = 0; before[1][6] = 4; before[2][6] = 4; before[3][6] = 4;
  const after = through(7);

  it("moves on when the last score of the hole goes in", () => {
    expect(autoAdvanceAction(G, before, after, 6)).toBe("schedule");
  });

  it("doesn't move while the hole is still missing scores", () => {
    expect(autoAdvanceAction(G, through(6), before, 6)).toBe("none");
  });

  it("restarts the wait when the last score is adjusted before it moves", () => {
    // Tapped + for a bogey, then + again for a double — still finished, still waiting.
    const adjusted = through(7); adjusted[4][6] = 6;
    expect(autoAdvanceAction(G, after, adjusted, 6, true)).toBe("schedule");
  });

  it("stays put when someone fixes a finished hole later", () => {
    const fixed = through(7); fixed[2][6] = 5;
    expect(autoAdvanceAction(G, after, fixed, 6, false)).toBe("none");
  });

  it("cancels a waiting move if a score is cleared", () => {
    expect(autoAdvanceAction(G, after, before, 6, true)).toBe("cancel");
  });

  it("never moves past the 18th", () => {
    const b = through(17), a = through(18);
    expect(autoAdvanceAction(G, b, a, 17)).toBe("none");
    expect(autoAdvanceAction(G, b, a, 17, true)).toBe("cancel");
  });
});

describe("holesDone", () => {
  it("counts finished holes", () => {
    expect(holesDone(G, through(8))).toBe(8);
    expect(holesDone(G, {})).toBe(0);
  });
});

describe("pendingWrites — scores still on the phone", () => {
  const deferred = () => { let res, rej; const p = new Promise((a, b) => { res = a; rej = b; }); return { p, res, rej }; };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("counts a save until the server has it", async () => {
    const pw = createPendingWrites();
    const d = deferred();
    pw.track(d.p, "score", () => 0);
    expect(pw.size()).toBe(1);
    d.res();
    await flush();
    expect(pw.size()).toBe(0);
  });

  it("stops counting a save that fails, too", async () => {
    const pw = createPendingWrites();
    const d = deferred();
    pw.track(d.p, "score", () => 0).catch(() => {});
    d.rej(new Error("nope"));
    await flush();
    expect(pw.size()).toBe(0);
  });

  it("only reports saves that have been waiting a while", () => {
    const pw = createPendingWrites();
    pw.track(new Promise(() => {}), "score", () => 1000);
    pw.track(new Promise(() => {}), "score", () => 4500);
    expect(pw.waiting(5000, 3000)).toEqual({ total: 1, score: 1, change: 0 });
    expect(pw.waiting(9000, 3000)).toEqual({ total: 2, score: 2, change: 0 });
  });

  it("splits scores from other changes", () => {
    const pw = createPendingWrites();
    pw.track(new Promise(() => {}), "score", () => 0);
    pw.track(new Promise(() => {}), "change", () => 0);
    expect(pw.waiting(10000)).toEqual({ total: 2, score: 1, change: 1 });
  });

  it("tells listeners when something starts and finishes", async () => {
    const pw = createPendingWrites();
    let calls = 0;
    const off = pw.subscribe(() => calls++);
    const d = deferred();
    pw.track(d.p);
    d.res();
    await flush();
    expect(calls).toBe(2);
    off();
    pw.track(Promise.resolve());
    await flush();
    expect(calls).toBe(2);
  });
});

describe("waitingLabel", () => {
  it("says nothing when nothing is waiting", () => {
    expect(waitingLabel({ total: 0, score: 0, change: 0 })).toBeNull();
  });

  it("counts scores", () => {
    expect(waitingLabel({ total: 1, score: 1, change: 0 })).toBe("1 score waiting to send");
    expect(waitingLabel({ total: 3, score: 3, change: 0 })).toBe("3 scores waiting to send");
  });

  it("counts other changes, and a mix", () => {
    expect(waitingLabel({ total: 1, score: 0, change: 1 })).toBe("1 change waiting to send");
    expect(waitingLabel({ total: 4, score: 3, change: 1 })).toBe("4 changes waiting to send");
  });
});
