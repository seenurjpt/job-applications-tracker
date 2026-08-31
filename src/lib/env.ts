import { z } from "zod";

const schema = z
  .object({
    MONGODB_URI: z.string().url(),
    MONGODB_DB: z.string().min(1),
    AUTH_SECRET: z.string().min(32),
    AUTH_URL: z.string().url().default("http://localhost:3000"),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    // Search Console ownership verification token (OAuth branding review).
    GOOGLE_SITE_VERIFICATION: z.string().optional(),
    TOKEN_ENCRYPTION_KEY: z.string().length(64),
    ANTHROPIC_API_KEY_DEV: z.string().startsWith("sk-ant-").optional(),
    ANTHROPIC_EXTRACTION_MODEL: z.string().default("claude-haiku-4-5-20251001"),
    ANTHROPIC_DRAFT_MODEL: z.string().default("claude-sonnet-5"),
    INNGEST_EVENT_KEY: z.string().optional(),
    INNGEST_SIGNING_KEY: z.string().optional(),
    NODE_ENV: z.enum(["development", "test", "production"]),
    // Test-only escape hatches. Never set in production.
    E2E_TEST_MODE: z.string().optional(),
    GOOGLE_TOKEN_ENDPOINT: z.string().url().default("https://oauth2.googleapis.com/token"),
    GMAIL_API_BASE: z.string().url().default("https://gmail.googleapis.com"),
  })
  .refine(
    (v) => !(v.NODE_ENV === "production" && v.ANTHROPIC_API_KEY_DEV),
    "ANTHROPIC_API_KEY_DEV must not be set in production — users supply their own keys"
  )
  .refine(
    (v) => !(v.NODE_ENV === "production" && v.E2E_TEST_MODE),
    "E2E_TEST_MODE must not be set in production"
  );

export type Env = z.infer<typeof schema>;

/**
 * Parsed lazily on first access so that test setups can populate process.env
 * before any module that imports `env` is evaluated, but still fails at boot
 * for the app itself (next.config / instrumentation imports it eagerly).
 */
let cached: Env | null = null;

function parseEnv(): Env {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    cached ??= parseEnv();
    return cached[prop as keyof Env];
  },
});

/** Test hook: force re-parse after mutating process.env. */
export function resetEnvCacheForTests(): void {
  cached = null;
}
