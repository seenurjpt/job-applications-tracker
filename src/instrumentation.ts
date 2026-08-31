/**
 * Next.js boot hook: validate env and create indexes once per server start.
 * The literal NEXT_RUNTIME check is required — it lets the bundler drop the
 * node-only import (mongodb and friends) from the edge build.
 */
export async function register(): Promise<void> {
  // eslint-disable-next-line no-restricted-properties
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootNode } = await import("./instrumentation-node");
    await bootNode();
  }
}
