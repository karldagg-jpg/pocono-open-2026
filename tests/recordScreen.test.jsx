import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import fs from "fs";
import path from "path";
import RecordScreen from "../src/components/RecordScreen.jsx";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const screen = (event = archive.event) => text(
  <RecordScreen event={event} library={archive.library} weekendIndex={archive.index} weekendId="pocono-2026" others={[]} />,
);

describe("Record", () => {
  it("names each weekend's winner", () => {
    expect(screen()).toMatch(/Pocono Open 2026 Steve 214 net/);
  });

  it("lists the all-time money, best first", () => {
    const t = screen();
    expect(t).toMatch(/1 Steve 🏆 1 weekend · 3 rounds · best 84/);
    expect(t).toMatch(/\+\$197/);
  });

  it("compares the top two by default", () => {
    expect(screen()).toMatch(/Steve \d – \d Karl/);
  });

  it("waits for the first full card on a new weekend", () => {
    expect(screen({ players: [], rounds: { 1: { scores: {} } } })).toMatch(/the record starts with the first full card/);
  });
});
