import { describe, it, expect } from "vitest";
import { detectFollowUps, type ThreadMessage } from "@/domain/follow-up";

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

describe("detectFollowUps", () => {
  it("returns an empty set for an empty array", () => {
    expect(detectFollowUps([]).size).toBe(0);
  });

  it("does not count the initial application (single outbound)", () => {
    expect(detectFollowUps([out("a", 1)]).size).toBe(0);
  });

  it("counts a second outbound with no reply between (out, out)", () => {
    const r = detectFollowUps([out("a", 1), out("b", 8)]);
    expect([...r]).toEqual(["b"]);
  });

  it("counts two follow-ups (out, out, out)", () => {
    const r = detectFollowUps([out("a", 1), out("b", 8), out("c", 15)]);
    expect([...r].sort()).toEqual(["b", "c"]);
  });

  it("does not count an outbound that follows an inbound reply (out, in, out)", () => {
    const r = detectFollowUps([out("a", 1), inb("b", 2), out("c", 3)]);
    expect(r.size).toBe(0);
  });

  it("counts only the true nudge in (out, in, out, out)", () => {
    const r = detectFollowUps([out("a", 1), inb("b", 2), out("c", 3), out("d", 10)]);
    expect([...r]).toEqual(["d"]);
  });

  it("counts only the first nudge in (out, out, in, out)", () => {
    const r = detectFollowUps([out("a", 1), out("b", 8), inb("c", 9), out("d", 10)]);
    expect([...r]).toEqual(["b"]);
  });

  it("is order-independent", () => {
    const msgs = [out("c", 3), out("a", 1), inb("b", 2)];
    expect(detectFollowUps(msgs).size).toBe(0);

    const shuffled = [out("d", 10), inb("c", 9), out("b", 8), out("a", 1)];
    expect([...detectFollowUps(shuffled)]).toEqual(["b"]);
  });

  it("does not mutate the input array", () => {
    const msgs = [out("c", 3), out("a", 1)];
    detectFollowUps(msgs);
    expect(msgs.map((m) => m.id)).toEqual(["c", "a"]);
  });

  it("is deterministic and does not crash on identical timestamps", () => {
    const msgs = [out("a", 1), out("b", 1), out("c", 1)];
    const first = [...detectFollowUps(msgs)].sort();
    for (let i = 0; i < 5; i++) {
      expect([...detectFollowUps(msgs)].sort()).toEqual(first);
    }
    // Three outbound, no inbound: exactly two are follow-ups regardless of ties.
    expect(first.length).toBe(2);
  });
});
