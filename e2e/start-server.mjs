// Launched by Playwright's webServer (which starts BEFORE globalSetup, so all
// E2E infrastructure lives here): an in-memory MongoDB, the Gmail/Anthropic
// stub server on :3101, and the Next dev server on :3100 wired to both.
// Playwright kills this process tree at the end of the run (taskkill /T on
// Windows), which takes mongod and next down with it.
import { spawn } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";
import { startStubServer } from "./stub-server.mjs";

const mongod = await MongoMemoryServer.create();
await startStubServer(3101);
console.log(`[e2e] mongo at ${mongod.getUri()}, stub on :3101`);

const child = spawn(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "next", "dev", "-p", "3100"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      MONGODB_URI: mongod.getUri(),
      MONGODB_DB: "e2e",
      AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789ab",
      AUTH_URL: "http://localhost:3100",
      GOOGLE_CLIENT_ID: "e2e-client",
      GOOGLE_CLIENT_SECRET: "e2e-secret",
      TOKEN_ENCRYPTION_KEY: "d".repeat(64),
      E2E_TEST_MODE: "1",
      GMAIL_API_BASE: "http://localhost:3101",
      GOOGLE_TOKEN_ENDPOINT: "http://localhost:3101/token",
      ANTHROPIC_BASE_URL: "http://localhost:3101/anthropic",
      ANTHROPIC_EXTRACTION_MODEL: "claude-haiku-4-5-20251001",
      ANTHROPIC_DRAFT_MODEL: "claude-sonnet-5",
    },
  }
);

async function shutdown(code) {
  try {
    child.kill();
    await mongod.stop();
  } finally {
    process.exit(code);
  }
}

child.on("exit", (code) => shutdown(code ?? 0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));
