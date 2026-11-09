import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import fs from "fs";
import path from "path";
import CourseScreen, { CourseEditor } from "../src/components/CourseScreen.jsx";
import { cloneWeekend } from "../src/lib/newWeekend.js";
import { DEFAULT_PAR, DEFAULT_SI } from "../src/lib/courseLibrary.js";

const archive = JSON.parse(fs.readFileSync(path.join(process.cwd(), "archives/pocono-2026.json"), "utf8"));
const LIB = archive.library;
const noop = () => {};
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const screen = (event, library = LIB) => text(
  <CourseScreen event={event} library={library} saveEvent={noop} weekendIndex={archive.index} weekendId="pocono-2026" />,
);

describe("Courses — this weekend", () => {
  it("shows each 2026 round on its course, locked", () => {
    const t = screen(archive.event);
    expect(t).toMatch(/Round 1 Buck Hill Golf Club White\/blue \(White tees\) Par 72 · 75.9 \/ 139 Locked/);
    expect(t).toMatch(/Round 3 Woodloch Springs \(Black Tees\)/);
  });

  it("asks for a course on every round of a new four-round weekend", () => {
    const t = screen(cloneWeekend(archive.event, { label: "Pinehurst", roundCount: 4 }));
    expect(t.match(/Choose a course/g)).toHaveLength(4);
    expect(t.match(/Not set/g)).toHaveLength(4);
    expect(t).toMatch(/Round 4/);
  });

  it("says Ready for a course picked but not yet played", () => {
    const e = cloneWeekend(archive.event, { label: "Pinehurst", roundCount: 3 });
    e.rounds[1].courseId = "c_ms92etjiercr";
    expect(screen(e)).toMatch(/Honey Brook Tee 5 Par 70 · 67.3 \/ 121 Ready/);
  });

  it("offers the library's version when it has changed since the weekend started", () => {
    const edited = JSON.parse(JSON.stringify(LIB)); edited["2"].slope = 120;
    expect(screen(archive.event, edited)).toMatch(/The library's version has changed since this weekend started\. Use the new version/);
    expect(screen(archive.event)).not.toMatch(/has changed since/);
  });
});

describe("Courses — the library", () => {
  it("says where each course was played, naming a tie", () => {
    const t = screen(archive.event);
    expect(t).toMatch(/Pocono Open 2026, round 1 · 11 played · avg 94.5 · best Jake 81 · low net Steve & Jake 72/);
  });

  it("says a course hasn't been played yet", () => {
    expect(screen(archive.event)).toMatch(/Honey Brook Tee 5 Not played yet/);
  });

  it("shows tee sets of one course together", () => {
    const lib = {
      a: { course: "Pinehurst No. 2", tees: "Blue", name: "Pinehurst No. 2 · Blue", slope: 138, rating: 75.1, par: DEFAULT_PAR, si: DEFAULT_SI },
      b: { course: "Pinehurst No. 2", tees: "White", name: "Pinehurst No. 2 · White", slope: 131, rating: 72.4, par: DEFAULT_PAR, si: DEFAULT_SI },
    };
    const t = screen({ rounds: { 1: {} } }, lib);
    expect(t).toMatch(/Course library · 1/);
    expect(t).toMatch(/Pinehurst No. 2 Not played yet Blue Par 72 · 75.1 \/ 138 .* White Par 72 · 72.4 \/ 131/);
  });

  it("invites the first course when the library is empty", () => {
    expect(screen({ rounds: { 1: {} } }, {})).toMatch(/No courses yet/);
  });
});

describe("Course editor", () => {
  const editor = (draft, extra = {}) => renderToStaticMarkup(
    <CourseEditor editing={{ id: "__new__", draft, assignTo: null, ...extra }} setDraft={noop} inUse={[]} started={[]} onCancel={noop} onSave={noop} />,
  );
  const good = { course: "Pinehurst No. 2", tees: "Blue", slope: 138, rating: 75.1, par: [...DEFAULT_PAR], si: [...DEFAULT_SI] };

  it("lets a complete course be saved", () => {
    const html = editor(good);
    expect(html).not.toMatch(/disabled/);
    expect(html).toMatch(/Add to library/);
  });

  it("blocks a duplicate stroke index and says where", () => {
    const si = [...DEFAULT_SI]; si[1] = 1;
    const html = editor({ ...good, si });
    expect(html).toMatch(/Stroke index 1 is on holes 1 and 2/);
    expect(html).toMatch(/disabled=""/);
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(2);   // both boxes outlined
  });

  it("offers to add and use a new course straight from a round", () => {
    expect(editor(good, { assignTo: 2 })).toMatch(/Add and use for round 2/);
  });

  it("titles new tees on an existing course", () => {
    expect(editor({ ...good, tees: "" })).toMatch(/New tees · Pinehurst No. 2/);
  });

  it("explains that a started round keeps its version", () => {
    const html = renderToStaticMarkup(
      <CourseEditor editing={{ id: "1", draft: good }} setDraft={noop} inUse={[1]} started={[1]} onCancel={noop} onSave={noop} />,
    );
    expect(html).toMatch(/keeps the version it started with/);
  });
});
