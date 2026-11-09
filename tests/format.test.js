import { describe, it, expect } from "vitest";
import { fmtIndex } from "../src/lib/format.js";

describe("fmtIndex", () => {
  it("shows one decimal place", () => {
    expect(fmtIndex(10.3)).toBe("10.3");
    expect(fmtIndex(14)).toBe("14.0");
    expect(fmtIndex("8.5")).toBe("8.5");
  });

  it("shows scratch as 0.0, not as missing", () => {
    expect(fmtIndex(0)).toBe("0.0");
  });

  it("shows a plus handicap as negative", () => {
    expect(fmtIndex(-1.2)).toBe("-1.2");
  });

  it("dashes a blank index instead of throwing", () => {
    expect(fmtIndex(null)).toBe("—");
    expect(fmtIndex(undefined)).toBe("—");
    expect(fmtIndex("")).toBe("—");
    expect(fmtIndex("abc")).toBe("—");
  });

  it("takes a different placeholder when asked", () => {
    expect(fmtIndex(null, "no index")).toBe("no index");
  });
});
