import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    name: "evals",
    include: ["tests/evals/**/*.eval.ts"],
    environment: "node",
    setupFiles: ["tests/evals/setup.ts"],
    testTimeout: 300_000,
  },
});
