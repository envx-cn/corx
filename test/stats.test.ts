import { describe, it, expect } from "vitest";
import { fillHourly } from "../src/admin.js";
import { humanBytes } from "../src/console/views.js";

describe("humanBytes", () => {
  it("formats across units", () => {
    expect(humanBytes(0)).toBe("0 B");
    expect(humanBytes(512)).toBe("512 B");
    expect(humanBytes(1023)).toBe("1023 B");
    expect(humanBytes(1024)).toBe("1 KB");
    expect(humanBytes(1536)).toBe("1.5 KB");
    expect(humanBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(humanBytes(2.5 * 1024 ** 3)).toBe("2.5 GB");
  });
  it("unknown → em dash", () => {
    expect(humanBytes(null)).toBe("—");
    expect(humanBytes(undefined)).toBe("—");
    expect(humanBytes(NaN)).toBe("—");
    expect(humanBytes(-1)).toBe("—");
  });
});

describe("fillHourly", () => {
  // 2026-09-09T10:00:00Z
  const now = Date.UTC(2026, 8, 9, 10, 30);
  it("fills 24 buckets, gaps become zeros", () => {
    const rows = [
      { hour: "2026-09-09T10", n: 5, bytes: 100 },
      { hour: "2026-09-09T08", n: 2, bytes: null },
    ];
    const out = fillHourly(rows, now);
    expect(out).toHaveLength(24);
    expect(out[23]).toEqual({ hour: "2026-09-09T10", requests: 5, bytes: 100 });
    expect(out[22]).toEqual({ hour: "2026-09-09T09", requests: 0, bytes: 0 });
    expect(out[21]).toEqual({ hour: "2026-09-09T08", requests: 2, bytes: 0 });
    expect(out[0]).toEqual({ hour: "2026-09-08T11", requests: 0, bytes: 0 });
  });
});
