# Job Tracker

A Next.js + MongoDB app that connects a Gmail account, extracts job
applications from sent mail with the Anthropic API (using each user's **own**
API key), tracks follow-ups, and generates follow-up drafts inside the
original Gmail threads.

Built to the specification in `../job-tracker-build-spec.md`. That document is
the source of truth for the architecture; this README covers running it.

## Stack

Next.js 15 (App Router, Server Actions) · TypeScript strict · MongoDB (native
driver) · Zod (single source of truth for every schema) · Auth.js v5 ·
Anthropic SDK (Haiku for extraction, Sonnet for drafts) · Tailwind + TanStack
Table · Vitest + mongodb-memory-server + MSW · Playwright.

## Setup

1. `pnpm install`
2. Copy `.env.example` to `.env.local` and fill it in (see spec §2 for the
   Google Cloud setup , **two projects**, exact scopes, Testing-mode caveats).
   - `AUTH_SECRET`: `openssl rand -base64 32`
   - `TOKEN_ENCRYPTION_KEY`: `openssl rand -hex 32`
3. Run MongoDB locally (`mongodb://localhost:27017`).
4. `pnpm dev`. Sync ("Sync sent mail" / "Refresh now" on the dashboard) runs
   inline in the request , no background job runner required.

Users bring their own Anthropic API key (Settings → API key). The app ships
with **no** Anthropic key in production; `ANTHROPIC_API_KEY_DEV` exists only
for local development and evals, and the env schema refuses to boot if it is
set in production.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint, including the `src/domain` purity rule and the no-`process.env` rule |
| `pnpm test:unit` | Pure domain/unit tests (fast, no I/O) |
| `pnpm test:integration` | Real Mongo (in-memory) + MSW-intercepted Gmail/Anthropic |
| `pnpm test:e2e` | Playwright against `next dev` with stubbed OAuth/Gmail/Anthropic and a seeded DB |
| `pnpm eval:extraction` | LLM extraction accuracy eval , **costs money**, uses `ANTHROPIC_API_KEY_DEV`, not part of CI |

Windows note: `mongodb-memory-server` needs the VC++ 2015–2022 x64
redistributable installed (`https://aka.ms/vs/17/release/vc_redist.x64.exe`).

## Architecture notes

- `src/domain/` is pure , no db, no services, no framework imports. Enforced
  by ESLint (`no-restricted-imports`) and covered by fast unit tests.
- `src/db/schemas.ts` holds every Zod schema; all TypeScript types are
  inferred from it.
- Anthropic clients are constructed **per request** from the calling user's
  stored key (`src/services/anthropic/client.ts`). There is deliberately no
  module-level client; `tests/integration/key-isolation.test.ts` proves
  concurrent requests never cross keys.
- Deviation from spec §6.4: clients use `maxRetries: 0` instead of `2`. The
  retry policy the spec mandates in §6.5/§6.7 (exponential backoff + jitter,
  honour `retry-after`, up to 5 attempts, 429 never marks a key invalid) is
  implemented once in `src/services/anthropic/call.ts` and used for every
  call , one retry layer instead of two stacked ones, and throttling stays
  observable to the sync pipeline.
- Sync jobs persist a `pageToken` cursor after every page and **pause** (never
  fail) on key problems, so Resume continues where it stopped. A
  `thread_classifications` cache guarantees a thread is billed to the user at
  most once, even across re-runs.
- Every collection's indexes are created at boot (`src/instrumentation.ts`);
  the unique `{accountId, threadId}` index is what makes sync idempotent.

## E2E mode

`E2E_TEST_MODE=1` (refused in production by the env schema) enables a
credentials login for Playwright, the `/api/test/seed` route, and lets the
Gmail/Anthropic endpoints be pointed at `e2e/stub-server.mjs`. Playwright's
global setup wires all of this automatically , just run `pnpm test:e2e`.

## Compliance (spec §10)

The privacy policy page (`/privacy`) discloses the metadata-only transfer to
Anthropic under the user's own account, retention governed by the user's own
Anthropic settings, AES-256-GCM storage of tokens and keys, deletion on
disconnect, and the no-logging guarantee (enforced by `src/lib/logger.ts`
redaction, with tests).
