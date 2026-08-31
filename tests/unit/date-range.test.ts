import { describe, it, expect } from "vitest";
import { resolveRange, toGmailQuery } from "@/domain/date-range";

const NOW = new Date("2026-06-15T12:00:00Z");

describe("resolveRange", () => {
  it("resolves last_week to a 7-day window ending now", () => {
    const r = resolveRange("last_week", NOW);
    expect(r.to).toEqual(NOW);
    expect((r.to.getTime() - r.from.getTime()) / 86_400_000).toBe(7);
  });

  it("resolves last_6_months", () => {
    const r = resolveRange("last_6_months", NOW);
    expect(r.from.toISOString().slice(0, 10)).toBe("2025-12-15");
  });

  it("today starts at local start of day", () => {
    const r = resolveRange("today", NOW);
    expect(r.from.getTime()).toBeLessThanOrEqual(NOW.getTime());
    expect(r.to).toEqual(NOW);
  });

  it("custom requires an explicit range", () => {
    expect(() => resolveRange("custom", NOW)).toThrow();
  });

  it("custom rejects from > to", () => {
    expect(() =>
      resolveRange("custom", NOW, {
        from: new Date("2026-06-10"),
        to: new Date("2026-06-01"),
      })
    ).toThrow();
  });

  it("custom passes through a valid range", () => {
    const from = new Date("2026-01-01");
    const to = new Date("2026-02-01");
    expect(resolveRange("custom", NOW, { from, to })).toEqual({ from, to });
  });
});

describe("toGmailQuery", () => {
  it("formats in the mailbox timezone and makes before: inclusive via +1 day", () => {
    const q = toGmailQuery(
      { from: new Date("2026-06-01T00:00:00Z"), to: new Date("2026-06-10T00:00:00Z") },
      "UTC"
    );
    expect(q).toBe("in:sent after:2026/06/01 before:2026/06/11");
  });

  it("an email sent 23:30 IST lands in the correct IST day bucket", () => {
    // 2026-06-09 23:30 IST == 2026-06-09 18:00 UTC. In UTC-formatting this
    // would be the 9th too, but 23:30 IST on the 9th is 2026-06-09T18:00Z ,
    // whereas midnight IST boundary cases shift: 00:30 IST on the 10th is
    // 19:00 UTC on the 9th. That's the off-by-one the tz matters for.
    const halfPastMidnightIst = new Date("2026-06-09T19:00:00Z"); // 00:30 IST June 10
    const q = toGmailQuery(
      { from: halfPastMidnightIst, to: halfPastMidnightIst },
      "Asia/Kolkata"
    );
    // In IST that instant is June 10, so after: must be 2026/06/10 (UTC would say 06/09).
    expect(q).toBe("in:sent after:2026/06/10 before:2026/06/11");
  });

  it("handles a DST-observing zone without drift (America/New_York)", () => {
    // 2026-03-08 is the US spring-forward date. 2026-03-08T06:30Z is 01:30 EST.
    const duringTransition = new Date("2026-03-08T06:30:00Z");
    const q = toGmailQuery(
      { from: duringTransition, to: duringTransition },
      "America/New_York"
    );
    expect(q).toBe("in:sent after:2026/03/08 before:2026/03/09");

    // Just before midnight local on the 7th must stay the 7th.
    const lateNight = new Date("2026-03-08T04:59:00Z"); // 23:59 EST March 7
    expect(
      toGmailQuery({ from: lateNight, to: lateNight }, "America/New_York")
    ).toBe("in:sent after:2026/03/07 before:2026/03/08");
  });
});
