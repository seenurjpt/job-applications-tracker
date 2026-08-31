import { describe, it, expect } from "vitest";
import {
  deriveStatus,
  DEFAULT_STATUS_CONFIG,
  type DerivedApplicationStatus,
  type StatusInput,
} from "@/domain/status";
import { ApplicationStatus } from "@/db/schemas";

const NOW = new Date("2026-06-15T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

function input(overrides: Partial<StatusInput>): StatusInput {
  return {
    lastOutboundAt: daysAgo(1),
    lastInboundAt: null,
    replyClassification: null,
    now: NOW,
    ...overrides,
  };
}

describe("deriveStatus", () => {
  const c = DEFAULT_STATUS_CONFIG;

  it("returns applied for a fresh application", () => {
    expect(deriveStatus(input({ lastOutboundAt: daysAgo(1) }), c)).toBe("applied");
  });

  it("returns applied at 6.99 days (just under the boundary)", () => {
    expect(deriveStatus(input({ lastOutboundAt: daysAgo(6.99) }), c)).toBe("applied");
  });

  it("returns needs_follow_up at exactly 7 days", () => {
    expect(deriveStatus(input({ lastOutboundAt: daysAgo(7) }), c)).toBe(
      "needs_follow_up"
    );
  });

  it("returns needs_follow_up at 29.99 days", () => {
    expect(deriveStatus(input({ lastOutboundAt: daysAgo(29.99) }), c)).toBe(
      "needs_follow_up"
    );
  });

  it("returns ghosted at exactly 30 days", () => {
    expect(deriveStatus(input({ lastOutboundAt: daysAgo(30) }), c)).toBe("ghosted");
  });

  it("returns ghosted well past 30 days", () => {
    expect(deriveStatus(input({ lastOutboundAt: daysAgo(90) }), c)).toBe("ghosted");
  });

  it("an inbound reply beats time-based statuses, even at 90 days", () => {
    expect(
      deriveStatus(
        input({ lastOutboundAt: daysAgo(90), lastInboundAt: daysAgo(80) }),
        c
      )
    ).toBe("replied");
  });

  it("maps rejection classification to rejected", () => {
    expect(
      deriveStatus(
        input({ lastInboundAt: daysAgo(1), replyClassification: "rejection" }),
        c
      )
    ).toBe("rejected");
  });

  it("maps positive classification to interviewing", () => {
    expect(
      deriveStatus(
        input({ lastInboundAt: daysAgo(1), replyClassification: "positive" }),
        c
      )
    ).toBe("interviewing");
  });

  it("maps neutral classification to replied", () => {
    expect(
      deriveStatus(
        input({ lastInboundAt: daysAgo(1), replyClassification: "neutral" }),
        c
      )
    ).toBe("replied");
  });

  it("respects a custom config", () => {
    const custom = { followUpAfterDays: 3, ghostAfterDays: 10 };
    expect(deriveStatus(input({ lastOutboundAt: daysAgo(3) }), custom)).toBe(
      "needs_follow_up"
    );
    expect(deriveStatus(input({ lastOutboundAt: daysAgo(10) }), custom)).toBe(
      "ghosted"
    );
  });
});

describe("domain status union stays in sync with db schema", () => {
  it("every derived status is a valid ApplicationStatus", () => {
    const derived: DerivedApplicationStatus[] = [
      "applied",
      "needs_follow_up",
      "replied",
      "interviewing",
      "rejected",
      "ghosted",
    ];
    for (const s of derived) {
      expect(ApplicationStatus.safeParse(s).success).toBe(true);
    }
  });
});
