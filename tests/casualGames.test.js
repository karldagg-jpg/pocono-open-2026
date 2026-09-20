import { describe, it, expect } from "vitest";
import {
  createCasualGame, addCasualPlayer, removeCasualPlayer, listCasualGames,
  upsertCasualGame, deleteCasualGame, gameReadiness,
} from "../src/lib/casualGames.js";

const at = (iso) => () => new Date(iso).getTime();

describe("createCasualGame", () => {
  it("dates itself today and names itself if you don't", () => {
    const g = createCasualGame({ now: at("2027-05-14T12:00:00Z") });
    expect(g.date).toBe("2027-05-14");
    expect(g.label).toBe("Round 2027-05-14");
    expect(g.id).toMatch(/^g_/);
  });

  it("keeps a label you give it", () => {
    expect(createCasualGame({ label: "  Saturday dogfight  " }).label).toBe("Saturday dogfight");
  });

  it("starts empty and ready to fill", () => {
    const g = createCasualGame();
    expect(g.players).toEqual([]);
    expect(g.scores).toEqual({});
    expect(g.courseId).toBeNull();
  });

  it("accepts players up front", () => {
    const g = createCasualGame({ players: [{ id: 1, name: "Karl", hcpIndex: 10.3 }] });
    expect(g.players).toHaveLength(1);
    expect(g.playerIds).toEqual([1]);
  });

  it("copies players rather than aliasing the caller's objects", () => {
    const src = [{ id: 1, name: "Karl", hcpIndex: 10.3 }];
    const g = createCasualGame({ players: src });
    g.players[0].name = "Changed";
    expect(src[0].name).toBe("Karl");
  });
});

describe("addCasualPlayer", () => {
  it("adds someone with their index", () => {
    const g = addCasualPlayer(createCasualGame(), { name: "Steve", hcpIndex: 11.4, id: 7 });
    expect(g.players).toEqual([{ id: 7, name: "Steve", hcpIndex: 11.4 }]);
    expect(g.playerIds).toEqual([7]);
  });

  it("trims the name", () => {
    expect(addCasualPlayer(createCasualGame(), { name: "  Rob  ", id: 1 }).players[0].name).toBe("Rob");
  });

  it("ignores a blank name", () => {
    const g = createCasualGame();
    expect(addCasualPlayer(g, { name: "   " }).players).toHaveLength(0);
    expect(addCasualPlayer(g, {}).players).toHaveLength(0);
  });

  it("won't add the same person twice, whatever the casing", () => {
    let g = addCasualPlayer(createCasualGame(), { name: "Karl", id: 1 });
    g = addCasualPlayer(g, { name: "karl", id: 2 });
    g = addCasualPlayer(g, { name: " KARL ", id: 3 });
    expect(g.players).toHaveLength(1);
  });

  it("defaults a missing index to scratch rather than NaN", () => {
    expect(addCasualPlayer(createCasualGame(), { name: "Guest", id: 1 }).players[0].hcpIndex).toBe(0);
    expect(addCasualPlayer(createCasualGame(), { name: "G", id: 1, hcpIndex: "abc" }).players[0].hcpIndex).toBe(0);
  });

  it("reads a numeric string index", () => {
    expect(addCasualPlayer(createCasualGame(), { name: "G", id: 1, hcpIndex: "12.5" }).players[0].hcpIndex).toBe(12.5);
  });
});

describe("removeCasualPlayer", () => {
  const build = () => {
    let g = createCasualGame();
    g = addCasualPlayer(g, { name: "Karl", id: 1 });
    g = addCasualPlayer(g, { name: "Steve", id: 2 });
    return { ...g, scores: { 1: [4, 5], 2: [5, 4] }, takes: { 1: [true], 2: [false] }, junk: { 1: {}, 2: {} } };
  };

  it("removes the player", () => {
    const g = removeCasualPlayer(build(), 1);
    expect(g.players.map(p => p.id)).toEqual([2]);
    expect(g.playerIds).toEqual([2]);
  });

  it("takes their scores with them, leaving nothing dangling", () => {
    const g = removeCasualPlayer(build(), 1);
    expect(g.scores[1]).toBeUndefined();
    expect(g.takes[1]).toBeUndefined();
    expect(g.junk[1]).toBeUndefined();
    expect(g.scores[2]).toEqual([5, 4]);
  });

  it("is a no-op for someone who isn't in the game", () => {
    const g = build();
    expect(removeCasualPlayer(g, 99).players).toHaveLength(2);
  });
});

describe("listCasualGames", () => {
  it("puts the most recent first", () => {
    const all = {
      a: createCasualGame({ id: "a", date: "2027-05-01" }),
      b: createCasualGame({ id: "b", date: "2027-06-01" }),
      c: createCasualGame({ id: "c", date: "2027-04-01" }),
    };
    expect(listCasualGames(all).map(g => g.id)).toEqual(["b", "a", "c"]);
  });

  it("is stable for games on the same day", () => {
    const all = {
      g_1: createCasualGame({ id: "g_1", date: "2027-05-01" }),
      g_2: createCasualGame({ id: "g_2", date: "2027-05-01" }),
    };
    expect(listCasualGames(all).map(g => g.id)).toEqual(["g_2", "g_1"]);
  });

  it("copes with nothing stored yet", () => {
    expect(listCasualGames(undefined)).toEqual([]);
    expect(listCasualGames({})).toEqual([]);
  });
});

describe("upsert / delete", () => {
  it("adds then replaces by id", () => {
    const g = createCasualGame({ id: "x", label: "First" });
    let all = upsertCasualGame({}, g);
    expect(Object.keys(all)).toEqual(["x"]);
    all = upsertCasualGame(all, { ...g, label: "Renamed" });
    expect(Object.keys(all)).toHaveLength(1);
    expect(all.x.label).toBe("Renamed");
  });

  it("deletes without touching the others", () => {
    const all = { a: createCasualGame({ id: "a" }), b: createCasualGame({ id: "b" }) };
    expect(Object.keys(deleteCasualGame(all, "a"))).toEqual(["b"]);
  });

  it("does not mutate the object it was given", () => {
    const all = { a: createCasualGame({ id: "a" }) };
    deleteCasualGame(all, "a");
    upsertCasualGame(all, createCasualGame({ id: "b" }));
    expect(Object.keys(all)).toEqual(["a"]);
  });
});

describe("gameReadiness", () => {
  const courses = { c1: { name: "Honey Brook", par: Array(18).fill(4), si: Array.from({ length: 18 }, (_, i) => i + 1) } };

  it("asks for a course and players when empty", () => {
    const r = gameReadiness(createCasualGame(), courses);
    expect(r.ready).toBe(false);
    expect(r.problems).toEqual(["Pick a course", "Add at least 2 players (0 so far)"]);
  });

  it("still asks with only one player", () => {
    let g = createCasualGame({ courseId: "c1" });
    g = addCasualPlayer(g, { name: "Karl", id: 1 });
    expect(gameReadiness(g, courses).problems).toEqual(["Add at least 2 players (1 so far)"]);
  });

  it("is ready with a course and two players", () => {
    let g = createCasualGame({ courseId: "c1" });
    g = addCasualPlayer(g, { name: "Karl", id: 1 });
    g = addCasualPlayer(g, { name: "Steve", id: 2 });
    expect(gameReadiness(g, courses)).toEqual({ ready: true, problems: [] });
  });

  it("catches a course that has since been deleted from the library", () => {
    let g = createCasualGame({ courseId: "gone" });
    g = addCasualPlayer(g, { name: "A", id: 1 });
    g = addCasualPlayer(g, { name: "B", id: 2 });
    expect(gameReadiness(g, courses).problems).toContain("Pick a course");
  });

  it("handles no game at all", () => {
    expect(gameReadiness(null, courses).ready).toBe(false);
  });
});
