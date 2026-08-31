import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    name: "integration",
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // One worker: tests share a single in-memory Mongo instance.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
