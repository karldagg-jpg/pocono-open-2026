import { describe, it, expect, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import fs from "fs";
import path from "path";
import LiveScreen from "../src/components/LiveScreen.jsx";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
let store;
beforeEach(() => {
  store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
});
const render = () => renderToStaticMarkup(<LiveScreen event={archive.event} library={archive.library} weekendLabel="Pocono Open 2026" />)
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Live board", () => {
  it("asks who's looking, at the top, the first time", () => {
    const t = render();
    expect(t).toMatch(/Which one are you\?/);
    expect(t.indexOf("Which one are you?")).toBeLessThan(t.indexOf("PLAYER") === -1 ? t.indexOf("Player") : t.indexOf("PLAYER"));
    expect(t).not.toMatch(/ You nobody/);
  });

  it("stops asking once it knows, and keeps a quiet way to change it", () => {
    store["pocono:meId"] = String(archive.event.players.find((p) => p.name === "Karl").id);
    const t = render();
    expect(t).not.toMatch(/Which one are you\?/);
    expect(t).toMatch(/ You /);
  });

  it("says plays off, without the index jargon", () => {
    const t = render();
    expect(t).toMatch(/Steve Plays off 14/);
    expect(t).not.toMatch(/ idx/);
  });

  it("says Not started for someone with no card", () => {
    expect(render()).toMatch(/Russ Not started/);
  });

  it("labels the movement column", () => {
    expect(renderToStaticMarkup(<LiveScreen event={archive.event} library={archive.library} />)).toMatch(/aria-label="Movement"/);
  });
});

describe("full screen, with a way back", () => {
  const exit = () => {};
  it("has a Menu button on the board", () => {
    expect(renderToStaticMarkup(<LiveScreen event={archive.event} library={archive.library} onExit={exit} />)).toMatch(/‹ Menu/);
  });

  it("has it on an empty board too — a new weekend can't strand anyone", () => {
    const html = renderToStaticMarkup(<LiveScreen event={{ players: [], rounds: {} }} library={{}} onExit={exit} />);
    expect(html).toMatch(/No rounds set up yet/);
    expect(html).toMatch(/‹ Menu/);
  });

  it("and on a round with no course yet", () => {
    const e = { players: archive.event.players, rounds: { 1: { courseId: null, scores: {} } } };
    expect(renderToStaticMarkup(<LiveScreen event={e} library={{}} onExit={exit} />)).toMatch(/‹ Menu/);
  });
});
