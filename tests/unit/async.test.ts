import { describe, it, expect } from "vitest";
import { backoffDelay, mapWithConcurrency } from "@/lib/async";

describe("mapWithConcurrency", () => {
  it("preserves input order in results", async () => {
    const items = [30, 10, 20, 5];
    const out = await mapWithConcurrency(items, 2, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms * 2;
    });
    expect(out).toEqual([60, 20, 40, 10]);
  });

  it("never exceeds the concurrency cap", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async (x) => x)).toEqual([]);
  });

  it("propagates errors", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      })
    ).rejects.toThrow("boom");
  });
});

describe("backoffDelay", () => {
  it("stays within the exponential envelope", () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      for (let i = 0; i < 20; i++) {
        const d = backoffDelay(attempt, 500, 30_000);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(Math.min(30_000, 500 * 2 ** attempt));
      }
    }
  });
});
