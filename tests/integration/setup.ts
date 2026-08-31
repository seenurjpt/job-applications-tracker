// Integration test bootstrap: real MongoDB (mongodb-memory-server) + MSW
// intercepting Gmail/Google/Anthropic at the network layer, so the actual
// client code runs against realistic HTTP responses.

process.env.MONGODB_URI = "mongodb://localhost:27017/unused";
process.env.MONGODB_DB = "test";
process.env.AUTH_SECRET = "integration-test-secret-0123456789ab";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.TOKEN_ENCRYPTION_KEY = "b".repeat(64);

import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";
import { ApiFixture, buildHandlers } from "../fixtures/gmail-fixture";
import { setDbForTests } from "@/db/client";
import { ensureIndexes } from "@/db/indexes";
import { setLogSinkForTests } from "@/lib/logger";

export const fixture = new ApiFixture();
export const server = setupServer(...buildHandlers(fixture));
export const logLines: string[] = [];

let mongod: MongoMemoryServer;
export let client: MongoClient;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await new MongoClient(mongod.getUri()).connect();
  const db = client.db("test");
  setDbForTests(db);
  await ensureIndexes(db);
  // catch forgotten mocks — a test must never hit a real API
  server.listen({ onUnhandledRequest: "error" });
  setLogSinkForTests((_level, line) => logLines.push(line));
});

afterEach(async () => {
  server.resetHandlers();
  fixture.reset();
  logLines.length = 0;
  const db = client.db("test");
  for (const c of await db.collections()) await c.deleteMany({});
});

afterAll(async () => {
  server.close();
  setLogSinkForTests(null);
  setDbForTests(null);
  await client.close();
  await mongod.stop();
});
