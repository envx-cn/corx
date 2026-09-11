import { describe, expect, it } from "vitest";
import { activeNavItem } from "../app/routes/console/_nav.js";

describe("activeNavItem", () => {
  it("overview for the index path (with and without trailing slash)", () => {
    expect(activeNavItem("/console/")).toBe("/console/");
    expect(activeNavItem("/console")).toBe("/console/");
  });
  it("matches each section exactly and by prefix", () => {
    expect(activeNavItem("/console/keys")).toBe("/console/keys");
    expect(activeNavItem("/console/keys/abc")).toBe("/console/keys");
    expect(activeNavItem("/console/playground")).toBe("/console/playground");
    expect(activeNavItem("/console/playground/run")).toBe("/console/playground");
    expect(activeNavItem("/console/logs")).toBe("/console/logs");
    expect(activeNavItem("/console/blocked")).toBe("/console/blocked");
  });
  it("falls back to overview for other /console paths", () => {
    expect(activeNavItem("/console/whatever")).toBe("/console/");
    expect(activeNavItem("/console/keys2")).toBe("/console/"); // not a prefix match
  });
});
