// Eval bootstrap. Evals hit the REAL Anthropic API using ANTHROPIC_API_KEY_DEV
// , the only place in the codebase that variable is read (§8.5). They cost
// money and are non-deterministic: run on prompt/model changes, not in CI.

process.env.MONGODB_URI ??= "mongodb://localhost:27017/unused";
process.env.MONGODB_DB ??= "evals";
process.env.AUTH_SECRET ??= "eval-secret-0123456789abcdef0123456789";
process.env.GOOGLE_CLIENT_ID ??= "eval";
process.env.GOOGLE_CLIENT_SECRET ??= "eval";
process.env.TOKEN_ENCRYPTION_KEY ??= "c".repeat(64);

if (!process.env.ANTHROPIC_API_KEY_DEV) {
  throw new Error(
    "Evals require ANTHROPIC_API_KEY_DEV. Set it in .env.local and run: pnpm eval:extraction"
  );
}
