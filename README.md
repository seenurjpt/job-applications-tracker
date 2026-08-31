# ✳ Job Tracker

**Automatically track every job application you send from Gmail — and never miss a follow-up.**

Job Tracker connects your Gmail account, detects job applications in your **sent mail** using AI (running on your **own** Anthropic API key), organizes them into a dashboard with statuses like *Needs follow-up*, *Interviewing*, and *Ghosted*, and generates follow-up email drafts directly inside the original Gmail threads. It never sends email on your behalf.

## Features

- 🔍 **Automatic detection** — scans your Gmail sent mail, prefilters it for free with heuristics, then classifies candidate threads with Claude (Haiku) using only email *metadata* (subject, snippet, recipients, date). Full message bodies are never sent to the AI.
- 📊 **Dashboard & pipeline view** — every application gets a status derived from real thread activity: `applied → needs follow-up → replied → interviewing`, plus `rejected` and `ghosted`. Statuses you set manually are never overwritten by a sync.
- 🏷️ **Mail-intent flags** — an at-a-glance "Mailed for" badge (Applied / Follow-up / Interview / Negotiation) telling you what your last email in each thread was about.
- ✉️ **AI follow-up drafts** — generate a polite nudge, value-add, or final check-in draft (Claude Sonnet) for one application or in bulk; drafts are created *inside the original Gmail thread* for you to review and send yourself.
- 🔁 **Resumable, crash-safe sync** — the sync persists its cursor after every page and heartbeats as it works. Refresh the page, lose your connection, or have the server die mid-sync: it resumes from where it stopped, and a classification cache guarantees no thread is ever billed to your key twice.
- 💰 **Cost transparency** — an "Estimate cost" button tells you roughly how many classification requests a backfill will make *before* you run it, and a usage page tracks calls and tokens per month.
- 🔐 **Bring-your-own-key & privacy-first** — you supply your own Anthropic API key (stored encrypted with AES-256-GCM); the app ships with no key of its own in production, and tokens/keys/email bodies never appear in logs.

## How it works

```
Gmail sent mail
   │  list + metadata fetch (batched, rate-limit aware)
   ▼
Heuristic prefilter        ← free; drops 80–90% of mail
   │
   ▼
Claude classification      ← batches of 10, your API key, metadata only
   │  (cached per thread — never billed twice)
   ▼
Thread hydration           ← full thread metadata for confirmed applications
   │
   ▼
Status derivation          ← applied / needs follow-up / replied / interviewing
   │                          / rejected / ghosted, from real reply activity
   ▼
Dashboard · follow-up drafts · CSV export
```

Only mail **you actually sent** creates applications — no-reply notifications, job-board alerts, and other automated email are filtered out.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions), TypeScript strict |
| Database | MongoDB (native driver), indexes created at boot |
| Validation | Zod — single source of truth for every schema; all types inferred |
| Auth | Auth.js (NextAuth) v5 — Google sign-in, JWT sessions |
| AI | Anthropic SDK — Claude Haiku for extraction, Claude Sonnet for drafts |
| UI | Tailwind CSS v4, TanStack Table |
| Testing | Vitest, mongodb-memory-server, MSW, Playwright |

## Getting started

### Prerequisites

- Node.js 20+ and **pnpm**
- MongoDB running locally (`mongodb://localhost:27017`) or a connection string (e.g. Atlas)
- A Google Cloud project with OAuth credentials (below)
- An Anthropic API key (added later, in the app's Settings — not in env)

### 1. Install

```bash
git clone https://github.com/seenurjpt/job-applications-tracker.git
cd job-applications-tracker
pnpm install
```

### 2. Google Cloud setup

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com) and enable the **Gmail API**.
2. Configure the **OAuth consent screen** (External). While in *Testing* mode, add each Google account that will use the app under **Test users**. Note: in Testing mode Google expires refresh tokens after 7 days, so Gmail needs reconnecting weekly until the app is verified.
3. Create an **OAuth client ID** (Web application) with these **Authorized redirect URIs** (add your production domain equivalents when deploying):
   - `http://localhost:3000/api/auth/callback/google` — sign-in
   - `http://localhost:3000/api/gmail/callback` — Gmail connect
4. The Gmail connect flow requests `gmail.readonly` + `gmail.compose`. Both are required — the app reads sent mail and creates drafts, and never requests send permission.

### 3. Environment

Copy `.env.example` to `.env.local` and fill it in:

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `MONGODB_DB` | ✅ | Database name |
| `AUTH_SECRET` | ✅ | Session secret — `openssl rand -base64 32` |
| `AUTH_URL` | ✅ | App origin, no trailing slash (`http://localhost:3000` locally) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅ | From the OAuth client above |
| `TOKEN_ENCRYPTION_KEY` | ✅ | 64 hex chars — `openssl rand -hex 32`; encrypts OAuth tokens and API keys at rest |
| `ANTHROPIC_EXTRACTION_MODEL` | – | Default extraction model (Claude Haiku) |
| `ANTHROPIC_DRAFT_MODEL` | – | Default drafting model (Claude Sonnet) |
| `ANTHROPIC_API_KEY_DEV` | – | **Local dev/evals only.** The env schema refuses to boot production with this set — users supply their own keys |
| `GOOGLE_SITE_VERIFICATION` | – | Search Console HTML-tag token (needed for OAuth branding verification) |
| `E2E_TEST_MODE` | – | Test-only login + stub endpoints; refused in production |

Every variable is validated by a Zod schema at boot (`src/lib/env.ts`) — misconfiguration fails fast with a readable error.

### 4. Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with Google, then follow onboarding: connect Gmail → add your Anthropic API key → sync. Sync runs inline in the request — no background job runner or queue to set up.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint, including the `src/domain` purity rule and the no-`process.env` rule |
| `pnpm test:unit` | Pure domain/unit tests (fast, no I/O) |
| `pnpm test:integration` | Real Mongo (in-memory) + MSW-intercepted Gmail/Anthropic |
| `pnpm test:e2e` | Playwright against `next dev` with stubbed OAuth/Gmail/Anthropic and a seeded DB |
| `pnpm eval:extraction` | LLM extraction accuracy eval — **costs money**, uses `ANTHROPIC_API_KEY_DEV`, not part of CI |

Windows note: `mongodb-memory-server` needs the [VC++ 2015–2022 x64 redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe).

## Deployment (Vercel)

1. Import the repo into Vercel and set the environment variables above — with `AUTH_URL` set to your production URL (`https://your-app.vercel.app`, **no trailing slash**) and no `ANTHROPIC_API_KEY_DEV` / `E2E_TEST_MODE`.
2. In Google Cloud, add the production redirect URIs to the OAuth client:
   - `https://your-app.vercel.app/api/auth/callback/google`
   - `https://your-app.vercel.app/api/gmail/callback`
3. For Google's OAuth **branding verification**: verify domain ownership in Search Console (URL-prefix property + HTML-tag method — paste the token into `GOOGLE_SITE_VERIFICATION` and redeploy), and use the built-in public pages: the home page explains the app without login, `/privacy` carries the Limited-Use disclosure, `/terms` the terms of service.

Note: large backfills run inside a single serverless invocation; on Vercel's Hobby plan prefer smaller ranges (*Last week* / *Last month*) — an interrupted sync is detected by its stale heartbeat and resumes from its saved cursor automatically.

## Architecture notes

- `src/domain/` is **pure** — no db, no services, no framework imports. Enforced by ESLint (`no-restricted-imports`) and covered by fast unit tests.
- `src/db/schemas.ts` holds every Zod schema; all TypeScript types are inferred from it.
- Anthropic clients are constructed **per request** from the calling user's stored key (`src/services/anthropic/client.ts`). There is deliberately no module-level client; `tests/integration/key-isolation.test.ts` proves concurrent requests never cross keys.
- One retry layer: clients use `maxRetries: 0`, and the single retry policy (exponential backoff + jitter, honour `retry-after`, up to 5 attempts, 429 never marks a key invalid) lives in `src/services/anthropic/call.ts` — throttling stays observable to the sync pipeline.
- Sync jobs persist a `pageToken` cursor after every page, **heartbeat** on every write, and **pause** (never fail) on key problems. A stalled job — crash, redeploy, timeout — is reclaimed atomically and resumed from its cursor; the `thread_classifications` cache guarantees a thread is billed to the user at most once, even across re-runs.
- Every collection's indexes are created at boot (`src/instrumentation.ts`); the unique `{accountId, threadId}` index is what makes sync idempotent.
- Sign-in OAuth and Gmail-scopes OAuth are **separate flows**: login asks only for identity; the restricted Gmail scopes are requested only when the user explicitly connects a mailbox.

## Privacy & security

- **Metadata only to the AI** — subject, snippet, recipients, date. Never full message bodies. (The "show full message" viewer fetches bodies live from Gmail for *display only*; they are never stored and never sent to Anthropic.)
- **Your key, your data** — extraction runs under each user's own Anthropic account; retention is governed by their own Anthropic settings.
- **Encryption at rest** — OAuth tokens and API keys are AES-256-GCM encrypted; decrypted values exist only in server memory during a request.
- **No secrets in logs** — enforced by `src/lib/logger.ts` redaction, with tests.
- **Deletion** — disconnecting a mailbox permanently deletes its stored messages, applications, and drafts; account deletion removes everything including the key record and usage history.

See the live [privacy policy](https://job-applications-tracker-one.vercel.app/privacy) and [terms](https://job-applications-tracker-one.vercel.app/terms).

## E2E mode

`E2E_TEST_MODE=1` (refused in production by the env schema) enables a credentials login for Playwright, the `/api/test/seed` route, and lets the Gmail/Anthropic endpoints be pointed at `e2e/stub-server.mjs`. Playwright's global setup wires all of this automatically — just run `pnpm test:e2e`.

## Project structure

```
src/
├── app/                # Next.js App Router: landing, dashboard, applications,
│   │                   # settings, privacy/terms, API routes (auth, gmail, CSV export)
│   └── (app)/          # Authenticated shell (header, nav, banners)
├── actions/            # Server Actions (sync, applications, drafts, settings, keys)
├── components/         # UI components (table, sync controls, drafts, nav, user menu)
├── domain/             # PURE logic: prefilter, status derivation, thread assembly, dates
├── db/                 # Zod schemas, repositories, indexes, Mongo client
├── services/
│   ├── anthropic/      # Per-user clients, retry ladder, extraction & drafting prompts
│   ├── gmail/          # OAuth tokens, typed Gmail REST wrappers
│   └── sync/           # Backfill pipeline, incremental sync, estimates
└── lib/                # env validation, logger, serialization (DTOs), crypto
tests/                  # unit, integration, e2e, and LLM evals
```
