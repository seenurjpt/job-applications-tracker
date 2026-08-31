/**
 * Structured logger with mandatory redaction of secrets.
 *
 * Everything passed through here is serialised and scrubbed for:
 *  - Anthropic API keys        sk-ant-...
 *  - Google OAuth tokens       ya29...., access_token / refresh_token values
 *
 * Compliance requirement (§10): never log token values, API keys, or email bodies.
 */

const REDACTIONS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /sk-ant-[A-Za-z0-9_-]+/g, replacement: "sk-ant-[REDACTED]" },
  { pattern: /ya29\.[A-Za-z0-9_-]+/g, replacement: "ya29.[REDACTED]" },
  { pattern: /1\/\/[A-Za-z0-9_-]{20,}/g, replacement: "[REDACTED-REFRESH-TOKEN]" },
  {
    pattern: /("(?:access_token|refresh_token|apiKey|api_key)"\s*:\s*")[^"]+(")/g,
    replacement: "$1[REDACTED]$2",
  },
];

export function redact(text: string): string {
  let out = text;
  for (const { pattern, replacement } of REDACTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function serialise(value: unknown): string {
  if (typeof value === "string") return redact(value);
  if (value instanceof Error) {
    return redact(`${value.name}: ${value.message}`);
  }
  try {
    return redact(JSON.stringify(value));
  } catch {
    return redact(String(value));
  }
}

type Sink = (level: "info" | "warn" | "error", line: string) => void;

let sink: Sink = (level, line) => {
   
  console[level](line);
};

/** Test hook: capture log output instead of writing to the console. */
export function setLogSinkForTests(s: Sink | null): void {
  sink = s ?? ((level, line) => {
     
    console[level](line);
  });
}

function log(level: "info" | "warn" | "error", msg: string, meta?: unknown): void {
  const line =
    meta === undefined
      ? `[${level}] ${redact(msg)}`
      : `[${level}] ${redact(msg)} ${serialise(meta)}`;
  sink(level, line);
}

export const logger = {
  info: (msg: string, meta?: unknown) => log("info", msg, meta),
  warn: (msg: string, meta?: unknown) => log("warn", msg, meta),
  error: (msg: string, meta?: unknown) => log("error", msg, meta),
};
