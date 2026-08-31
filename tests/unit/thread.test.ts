import { describe, it, expect } from "vitest";
import { assembleThread } from "@/domain/thread";
import type { ThreadMessage } from "@/domain/follow-up";

const at = (d: number) => new Date(2026, 0, d);
const out = (id: string, d: number): ThreadMessage => ({
  id,
  direction: "outbound",
  sentAt: at(d),
});
const inb = (id: string, d: number): ThreadMessage => ({
  id,
  direction: "inbound",
  sentAt: at(d),
});

describe("assembleThread", () => {
  it("returns null when the thread has no outbound message", () => {
    expect(assembleThread([inb("a", 1)])).toBeNull();
    expect(assembleThread([])).toBeNull();
  });

  it("uses the first outbound as appliedAt", () => {
    const s = assembleThread([inb("x", 1), out("a", 2), out("b", 9)]);
    expect(s?.appliedAt).toEqual(at(2));
  });

  it("tracks last outbound, last inbound, and last activity", () => {
    const s = assembleThread([out("a", 1), inb("b", 3), out("c", 5)]);
    expect(s?.lastOutboundAt).toEqual(at(5));
    expect(s?.lastInboundAt).toEqual(at(3));
    expect(s?.lastActivityAt).toEqual(at(5));
  });

  it("lastInboundAt is null with no replies", () => {
    const s = assembleThread([out("a", 1), out("b", 9)]);
    expect(s?.lastInboundAt).toBeNull();
  });

  it("counts follow-ups consistently with detectFollowUps", () => {
    const s = assembleThread([out("a", 1), out("b", 8), inb("c", 9), out("d", 10)]);
    expect(s?.followUpCount).toBe(1);
    expect(s?.followUpIds.has("b")).toBe(true);
    expect(s?.followUpIds.has("d")).toBe(false);
  });

  it("is order-independent", () => {
    const s = assembleThread([out("c", 5), inb("b", 3), out("a", 1)]);
    expect(s?.appliedAt).toEqual(at(1));
    expect(s?.lastActivityAt).toEqual(at(5));
  });
});
