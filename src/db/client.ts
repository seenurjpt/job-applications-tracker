import { MongoClient, type Db } from "mongodb";
import { env } from "@/lib/env";

/**
 * Single pooled client. In dev, Next.js hot-reload re-evaluates modules, so the
 * client is stashed on globalThis to avoid connection leaks. Tests inject their
 * own client via setDbForTests (mongodb-memory-server).
 */

declare global {
   
  var __mongoClient: MongoClient | undefined;
}

let injected: Db | null = null;

export function setDbForTests(db: Db | null): void {
  injected = db;
}

function getClient(): MongoClient {
  if (!globalThis.__mongoClient) {
    globalThis.__mongoClient = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: 10,
    });
  }
  return globalThis.__mongoClient;
}

export function getDb(): Db {
  if (injected) return injected;
  return getClient().db(env.MONGODB_DB);
}

export async function closeDb(): Promise<void> {
  if (globalThis.__mongoClient) {
    await globalThis.__mongoClient.close();
    globalThis.__mongoClient = undefined;
  }
}
