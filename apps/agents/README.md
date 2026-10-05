# Portfolio twin agent (`apps/agents`)

## What it is

A first-person "twin" of the portfolio owner. It answers recruiters and clients in the Messenger window on `/os`, using only what the Payload CMS says about the owner. It offers a call when the conversation warrants it, asks the owner on Telegram before it shares anything restricted, and shows the Cal.com booker inline. It is an [eve](https://eve.dev) 0.71 agent on OpenRouter with a Postgres-backed durable runtime. The design is in [the spec](../../docs/superpowers/specs/2026-10-04-portfolio-twin-agent-design.md). This README describes the code as it is now; where the two disagree, see [Where the code differs from the spec](#where-the-code-differs-from-the-spec).

## Contents

1. [Status](#status)
2. [Architecture](#architecture)
3. [Run it locally](#run-it-locally)
4. [Env manifest](#env-manifest)
5. [How to add a skill](#how-to-add-a-skill)
6. [How to add a tool](#how-to-add-a-tool)
7. [How to add an MCP connection](#how-to-add-an-mcp-connection)
8. [Tuning call intent](#tuning-call-intent)
9. [Operations](#operations)
10. [Testing](#testing)
11. [Where the code differs from the spec](#where-the-code-differs-from-the-spec)

## Status

What has been checked:

- **Unit tests pass locally:** `apps/agents` has 31 files and 186 tests, and `packages/twin` has 10 files and 72 tests, at the commit that added this README.
- **The offline evals pass against local Postgres (`twin_eval`):** 4 evals and 18 gates, with the scripted model and local stubs, at the same commit.
- **CI has the jobs listed under [Testing](#testing).** No CI run result has been reviewed for this README.

What has **not** been verified:

- **No Docker image has been built on the development machine**, which has no Docker. That covers `apps/agents/Dockerfile` and the compose stack (`docker-compose.yml`) with `postgres` and `agents`. CI builds the agent with `eve build` but not the image, so the first real image build happens in Easypanel or on a machine with Docker.
- **The live evals (`evals/`) have not been run against a real model and the real CMS.**
- **None of the external integrations has run end to end against the real service:** Telegram approvals, Cal.com webhooks, Google free/busy, OpenRouter fallback routing, and the spend ledger with real OpenRouter cost metadata. Each one is covered by unit tests with mocked HTTP. Telegram and Payload MCP are also covered by local stubs in the offline evals.
- **`experimental.workflow.retention: 0` is unverified on the Postgres world.** eve's docs warn that "Custom Worlds used with eve might not support this feature". Nobody has checked that `@workflow/world-postgres` deletes run data at 0. See [Retention and deletion](#retention-and-deletion).

## Architecture

### Topology

```
browser ── /os Messenger (eve/react, host /api/twin) ──► web: /api/twin/eve/v1/* (BFF) ──(internal net, 60 s JWT)──► agents: eve start (/eve/v1/*)
                                                         │ signed cookie → visitor, session ownership,               │ OpenRouter (model + classifier)
                                                         │ rate limits and caps, spend cap, output filter            │ Payload MCP (twinIdentity/twinSearch/twinDisclose)
Cal.com ── webhook ──► web /api/twin/hooks/cal ──────────(raw body + signature header)──► agents /webhooks/cal      │ Google freeBusy, Exa, Telegram Bot API
Telegram ─ webhook ──► web /api/twin/hooks/telegram ─────(raw body + secret header)────► agents /webhooks/telegram  │
                                                         └──────────── Postgres: schema `twin` + the Workflow world ───┘
```

**The agents service is internal only.** It has no domain, and compose only `expose`s port 3000. It serves eve's Workflow routes (`/.well-known/workflow/v1/flow` and `/.well-known/workflow/v1/webhook/:token`), and [the Postgres world's README](https://github.com/vercel/workflow/tree/main/packages/world-postgres) states that they are unauthenticated: anyone who reaches them can forge or replay workflow and step invocations. The only service that reaches the agent is `web`.

**The web BFF** (`apps/web/app/api/twin/eve/v1/[...path]/route.ts`, `apps/web/lib/twin/*`) owns everything about the visitor:

- **Identity.** An httpOnly cookie `twin_vid` holds `<visitor uuid>.<HMAC>` under `TWIN_COOKIE_SECRET` and lasts 90 days. For each proxied request the BFF mints a 60-second HS256 JWT (`iss portfolio-web`, `aud portfolio-twin`, `sub` = visitor id, optional `tz`) under `TWIN_JWT_SECRET`. The agent's `visitorAuth` (`agent/lib/visitor-auth.ts`) turns it into a `user` principal `web:<uuid>`.
- **Session ownership.** The BFF proxies only three routes: `POST /session` (create), `POST /session/:id` and `GET /session/:id/stream`, and every session must be owned by the cookie's visitor (`ownsSession`). The bodies are `.strict()`: `inputResponses`, `clientContext`, `turnPolicy` and `outputSchema` are rejected. The control routes (`reset`, `cancel`, ...) are never proxied.
- **Rate limits and caps** (`lib/twin/limits.ts`, numbers in `TWIN_LIMITS`, `packages/twin/src/contract/limits.ts`). These are durable windows in Postgres:
  - per IP: 12 per minute and 300 per day;
  - per session: 8 per minute and 120 per day;
  - session creates are counted per IP on their own keys;
  - a message is at most 1,000 characters, and a conversation at most 40 turns;
  - the daily spend cap is `TWIN_DAILY_SPEND_USD`, summed over the UTC day.

  A refused message gets one of four refusals: `throttled`, `too_long`, `ended` or `offline`. A failure past validation also becomes `offline`, so failure details never reach the browser.
- **The output boundary** (`lib/twin/filter.ts`, `packages/twin/src/redact/*`):
  - **Redaction:** never-tier terms (from the CMS's `GET /api/twin/redact-terms`) and PII are redacted from assistant text. The stream redactor holds back a growing tail so that a term split across deltas can't leak.
  - **Canary:** a reply containing `TWIN_PROMPT_CANARY` is replaced with `LEAK_DEFLECTION`.
  - **Resumed streams:** the deltas of a block that started before the cut are blanked, and its `message.completed` carries the redacted text.
  - **Blanking:** reasoning, every tool payload except `schedule_call`'s successful output, every error message, failure details (only `code` survives), usage, `providerMetadata` and `session-limit` prompts are blanked.
  - **Fail closed:** without redaction rules, nothing streams.
  - **Forged context notes:** visitor text has `[context` neutralised (`lib/twin/neutralise.ts`), so it can't forge the agent's `[context, not from the visitor]` notes.

**Webhooks** enter through `apps/web/app/api/twin/hooks/[provider]/route.ts`. That route accepts `cal` and `telegram` only. It forwards the raw body plus the provider's signature headers to `agents /webhooks/<provider>`, and the agent verifies the signature next to the secret (`agent/channels/webhooks.ts`).

**Visitor deletion:** `DELETE /api/twin/me` (`apps/web/app/api/twin/me/route.ts`). See [Retention and deletion](#retention-and-deletion).

### Inside the agent

**Every turn:**

1. `agent/channels/eve.ts` authenticates the JWT (or `localDev()` under `eve dev`). It runs the abuse gate before dispatch (see [Model and classifiers](#model-and-classifiers)) and uses `turnPolicy: 'steer'`.
2. `agent/hooks/conversation.ts` on `turn.started` ensures the conversation row, counts the turn and prunes settled approvals. If any of that fails, the turn is cancelled before the model call.
3. `agent/memory/visitor.ts` recalls earlier conversations of the same visitor from Postgres, scoped `byPrincipal`.
4. `agent/instructions.ts` builds the whole system prompt from four parts:
   - the canary;
   - the CMS grounding (`twinIdentity`, cached 5 minutes per process);
   - the active skills;
   - a state digest of at most 600 characters, whose `call:` directive is the only thing that decides whether to offer a call.

   If any part fails, it falls back to an identity-and-boundaries prompt instead of none.
5. Each tool in `agent/tools/` is a `defineDynamic` resolver on `step.started` and is offered only when `toolGranted` says an active skill grants it. The exceptions are `request_disclosure` and `no_reply` (see below).
6. After a final reply, `message.completed` stores the redacted transcript and runs the call-intent evaluation. It never blocks time-to-first-token.

**Skills are composed per turn from conversation state, not loaded by the model.** eve's own skills are lazy: the model decides whether to call `load_skill`, and eve skills can't scope tools (spec §1, §5). A model that skipped loading `boundaries` would be a security failure. Here, each skill's `activeWhen(state)` is a pure predicate. The active skills are concatenated in a fixed order (`SKILL_NAMES`) as `<skill name version>` blocks (`agent/lib/skills/compose.ts`), so the prompt is deterministic, unit-testable and diffable. `defaultTools: false` removes `load_skill`, `bash`, `web_fetch` and the other framework tools.

| Skill | Active when | Grants |
| --- | --- | --- |
| `identity` | always | – |
| `boundaries` | always | – |
| `answer-depth` | conversation not ended | – |
| `portfolio-recall` | conversation not ended | `search_portfolio`, `request_disclosure` |
| `visitor-intake` | conversation not ended | `note_visitor`, `web_search` |
| `scheduling` | not ended and no confirmed booking | `check_availability`, `schedule_call`, `record_call_decline` |

`request_disclosure` is a workflow tool (`defineWorkflowTool`), and workflow tools can't be dynamic. So it is static: it is in the tool list on every step, and `portfolio-recall`'s prose owns its use. Its safety doesn't rest on gating. The CMS returns a restricted item only through `twinDisclose`, which the workflow calls only after the owner's recorded approval, and each session is capped at 3 approvals. `no_reply` (eve's `noReply()`) is always available.

### File map

```
agent/
  agent.ts                  defineAgent: OpenRouter model, defaultTools false, token limits, Postgres world, retention 0
  instructions.ts           per-turn system prompt (defineDynamic on turn.started), fail-closed fallback
  sandbox.ts                pinned just-bash sandbox (no Docker dependency at build)
  channels/eve.ts           visitor channel: JWT auth, abuse gate, steer policy, uploads disabled
  channels/webhooks.ts      POST /webhooks/telegram and /webhooks/cal (signature checks, idempotent)
  hooks/conversation.ts     turn bookkeeping, transcript, post-reply intent evaluation
  memory/visitor.ts         returning-visitor recall from Postgres
  instrumentation/spend.ts  spend ledger rows from eve events
  schedules/purge.ts        daily 90-day retention purge (cron 0 3 * * *)
  tools/                    search_portfolio, request_disclosure (workflow), note_visitor, web_search,
                            check_availability, schedule_call, record_call_decline, no_reply
  lib/
    env.ts, db.ts           lazy env (getEnv) and the shared Postgres handle
    models.ts               OpenRouter chat model with the `models` fallback chain; classifier model
    abuse.ts                pre-dispatch abuse classifier and context notes
    skills/                 define.ts (SKILL_NAMES, TOOL_NAMES, defineTwinSkill), registry.ts, compose.ts,
                            generated.ts (gitignored, written by `bun run skills`)
    tool-gate.ts            toolGranted(sessionId, tool)
    prompt.ts, state-digest.ts, grounding.ts, conversation.ts
    payload-mcp.ts          callPayloadTool: official MCP SDK client over Streamable HTTP, 5 s timeouts
    search.ts, disclosure.ts, approvals.ts (workflow steps), telegram.ts, telegram-decision.ts
    google-freebusy.ts, availability.ts, scheduling.ts, booking-ref.ts, booking-transition.ts, cal-webhook.ts
    intent/                 signals.ts, classify.ts, score.ts, weights.ts (INTENT_WEIGHTS), evaluate.ts
    untrusted.ts            <untrusted nonce> wrapping for CMS, web and memory content
    identity.ts, visitor-auth.ts, memory.ts, merge-visitor.ts, transcript.ts, spend.ts, secrets.ts, ...
skills/<name>/              SKILL.md (frontmatter description + metadata.version, then prose) and skill.ts
evals/                      live suite: evals/skills/<skill>/*.eval.ts, evals/acceptance/*, evals/lib/*
fixtures/offline/           offline eval app: scripted mockModel, re-exported real channels and tools,
                            Payload MCP and Telegram stubs (stubs/), evals/*.eval.ts, .env.example
scripts/bundle-skills.ts    SKILL.md → agent/lib/skills/generated.ts (run by every package script)
scripts/mint-eval-token.ts  JWT for live evals (EVE_EVAL_AUTH_TOKEN)
tests/                      vitest unit tests (pglite, no network)
Dockerfile                  image built from the repo root; runs world setup, twin migrations, then eve start
```

Shared code lives in `packages/twin` (`@repo/twin`):

- `contract/`: state, intent, limits and notices;
- `env.ts`: the env schemas;
- `db/`: Drizzle schema `twin`, queries and migrations;
- `redact/`: rules, text and stream redaction;
- `testing/`: the pglite test db.

## Run it locally

All commands run from the repository root in Git Bash unless they say otherwise.

### 1. Postgres

On this machine there is no Docker. **PostgreSQL 17 runs in WSL** (`Ubuntu-24.04`) on **`127.0.0.1:5433`**, with role and password `twin`/`twin`.

- **Always use `127.0.0.1`.** `localhost` resolves to `::1`, which WSL doesn't forward.
- **Wake the cluster:** `wsl -d Ubuntu-24.04 -u root -- pg_lsclusters`.
- **Check it's up:** `pg_isready -h 127.0.0.1 -p 5433`. The psql tools are in `C:/Users/felip/AppData/Local/Programs/pgsql/bin`.

There are two databases:

- `twin`: development. The web BFF and the agent behind it share it.
- `twin_eval`: the offline evals, CI's database name, and throwaway `eve dev` runs you don't want mixed into dev data.

On a machine with Docker, `docker-compose.dev.yml` is the equivalent. It only creates `twin`, so create `twin_eval` yourself:

```bash
docker compose -f docker-compose.dev.yml up -d postgres
docker compose -f docker-compose.dev.yml exec postgres createdb -U twin twin_eval
```

Create both schemas in each database you use: the twin tables, then the Workflow world.

```bash
export TWIN_DATABASE_URL=postgres://twin:twin@127.0.0.1:5433/twin
export WORKFLOW_POSTGRES_URL=$TWIN_DATABASE_URL
bun run --cwd packages/twin db:migrate     # drizzle migrations into schema twin (journal in twin_migrations)
bun run --cwd apps/agents world:setup       # @workflow/world-postgres `bootstrap`
```

Both commands are idempotent. The Docker image runs the same two before `eve start`.

### 2. The CMS

```bash
bun run --cwd apps/payload dev               # http://localhost:3001, MCP at /api/mcp
```

- **Set `TWIN_REDACT_SECRET` in `apps/payload/.env`** to the same value as in the agent and web env. `apps/payload/.env.example` doesn't list it yet. Without it, `/api/twin/redact-terms` answers 401, the BFF streams nothing, and the agent can't store transcripts.
- **Create the MCP key** in the admin with only the three twin tools (see [Payload](#payload-mcp-key-and-knowledge)).
- **The CMS dev server pushes its schema into `apps/payload/payload.db` on start.** Never reset or delete `payload.db`. Before anything that changes the CMS schema, back it up next to it: `cp apps/payload/payload.db apps/payload/payload.db.pre-<label>-$(date +%Y%m%d%H%M%S).bak`. Generate migrations against a throwaway database, as described in [docs/deploy-easypanel.md](../../docs/deploy-easypanel.md#updating).

### 3. The agent's `.env`

```bash
cp apps/agents/.env.example apps/agents/.env
```

Fill every required value (see the [Env manifest](#env-manifest)). `eve dev` loads `.env.development.local`, `.env.local`, `.env.development` and `.env`, and Bun loads `.env` for `bun run` scripts. Keep `CMS_URL=http://localhost:3001` and `PAYLOAD_MCP_URL=http://localhost:3001/api/mcp` for the local CMS.

### 4a. The terminal UI

```bash
bun run --cwd apps/agents dev                # bun run skills && eve dev
```

eve's TUI talks to the agent as the `local-dev` principal, which maps to the fixed visitor `00000000-0000-4000-8000-000000000001` (`DEV_VISITOR_ID`), created on demand. Every capability runs for real: OpenRouter, the CMS, Google, Exa, and Telegram if an approval is requested.

### 4b. Behind the web BFF

```bash
bun run --cwd apps/agents build              # bun run skills && eve build
PORT=4100 bun run --cwd apps/agents start    # eve start --host 0.0.0.0, on $PORT
```

Then, in `apps/web/.env.local` (template: `apps/web/.env.example`):

- set `TWIN_AGENT_URL=http://127.0.0.1:4100`;
- use the same `TWIN_JWT_SECRET`, `TWIN_PROMPT_CANARY`, `TWIN_REDACT_SECRET` and `TWIN_DATABASE_URL` as the agent;
- add a `TWIN_COOKIE_SECRET` of its own;
- set `CMS_URL`.

Run `bun run --cwd apps/web dev`, open `/os` and use Messenger. `eve start` serves the last build, so rebuild after every change.

### Local traces contain conversations

Under `eve dev`, eve writes traces to `apps/agents/.eve/traces/`. By default they include system prompts, messages, tool inputs and outputs, and recalled memory, which means **full conversation content on disk**.

- `EVE_TRACES_CONTENT=off` (in `apps/agents/.env.local`) drops the content and keeps the spans.
- `EVE_TRACES=off` stops writing traces.

`.eve/` is gitignored and excluded from the Docker context. On Vercel, eve auto-seeds an `agent-runs` instrumentation provider when `VERCEL_ENV` is `preview` or `production`, which would export content. This deployment is self-hosted, so that never applies.

## Env manifest

The schema is `agentsEnvSchema` in `packages/twin/src/env.ts`. It is parsed lazily by `getEnv()`, and one error lists every bad variable. An empty string counts as unset: compose renders `${VAR:-}` as `''`. The template is [`.env.example`](.env.example), and production values go in [`.env.deploy.example`](../../.env.deploy.example).

The Apps column says which services read each variable: **A** = agents, **W** = web, **C** = cms.

| Variable | Apps | Required / default | Purpose | Source |
| --- | --- | --- | --- | --- |
| `TWIN_DATABASE_URL` | A, W | required | Twin schema (state, approvals, ledger, limits) | Postgres; same DB for web and agents |
| `WORKFLOW_POSTGRES_URL` | A | required | eve's durable Workflow world | Postgres (same DB is fine) |
| `OPENROUTER_API_KEY` | A | required | Model and classifier calls | OpenRouter > Keys (set a credit limit) |
| `TWIN_MODEL` | A | `anthropic/claude-sonnet-5.5` | Primary model | OpenRouter model id |
| `TWIN_MODEL_FALLBACKS` | A | `deepseek/deepseek-v4.1-flash` | Comma list, OpenRouter `models` fallback chain | OpenRouter model ids |
| `TWIN_MODEL_CONTEXT_TOKENS` | A | `1000000` | `modelContextWindowTokens` (not in eve's catalog) | The primary model's context window |
| `TWIN_CLASSIFIER_MODEL` | A | `deepseek/deepseek-v4.1-flash` | Abuse gate and intent label | OpenRouter model id |
| `TWIN_CLASSIFIER_TIMEOUT_MS` | A | `4000` | Intent label timeout (post-reply) | – |
| `TWIN_ABUSE_TIMEOUT_MS` | A | `1500` | Abuse gate timeout (pre-dispatch, fails open) | – |
| `TWIN_JWT_SECRET` | A, W | required, ≥ 32 chars | HS256 key of the 60 s visitor JWT | `openssl rand -hex 32` |
| `TWIN_PROMPT_CANARY` | A, W | required, ≥ 16 chars | Prompt marker the BFF blocks | `openssl rand -hex 16` |
| `TWIN_STABLE_KEY_SECRET` | A | required, ≥ 32 chars | HMAC of a volunteered email (returning visitors) | `openssl rand -hex 32` |
| `TWIN_REDACT_SECRET` | A, W, C | required, ≥ 32 chars | Bearer for `GET /api/twin/redact-terms` | `openssl rand -hex 32` |
| `CMS_URL` | A, W | required | CMS origin (redaction rules) | `http://cms:3001` in compose (agents) |
| `PAYLOAD_MCP_URL` | A | required | Payload MCP endpoint | `<cms>/api/mcp` |
| `PAYLOAD_MCP_API_KEY` | A | required | MCP key with only the three twin tools | CMS admin > MCP > API Keys |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | A | required | base64 JSON key (`client_email`, `private_key`) | Google Cloud > Service accounts > Keys |
| `GOOGLE_CALENDAR_ID` | A | required | Calendar queried with `freeBusy` | Calendar settings > Integrate calendar |
| `OWNER_TIMEZONE` | A | required, IANA zone | Owner's zone for availability and the dialog | e.g. `America/Sao_Paulo` |
| `CAL_LINK` | A | required, `<user>/<slug>` | Event the booking dialog embeds | Cal.com event type URL |
| `CAL_ORIGIN` | A | `https://cal.com` | Cal origin (self-hosted only) | – |
| `CAL_EMBED_SCRIPT_URL` | A | `https://app.cal.com/embed/embed.js` | Embed loader (self-hosted only) | – |
| `CAL_WEBHOOK_SECRET` | A | required, ≥ 32 chars | Verifies `X-Cal-Signature-256` | Set on the Cal.com webhook |
| `TWIN_BOOKING_REF_SECRET` | A | required, ≥ 32 chars | Signs the `bookingRef` metadata | `openssl rand -hex 32` |
| `TELEGRAM_API_BASE` | A | `https://api.telegram.org` | Bot API base (stubbed in offline evals) | – |
| `TELEGRAM_BOT_TOKEN` | A | required, `<digits>:<token>` | Sends approvals, edits them, answers taps | @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | A | required, 16–256 of `[A-Za-z0-9_-]` | Verifies `X-Telegram-Bot-Api-Secret-Token` | Chosen by you, passed to `setWebhook` |
| `TELEGRAM_OWNER_USER_ID` | A | required, digits | Owner's chat id; only this user's taps count | @userinfobot |
| `TWIN_APPROVAL_TIMEOUT` | A | `15m` (`<n>s/m/h`) | Approval deadline before auto-deny | – |
| `EXA_API_KEY` | A | required | `web_search` | exa.ai dashboard |

The web BFF reads `webTwinEnvSchema`, from the same file:

- `TWIN_AGENT_URL` (the internal agent URL; compose uses `http://agents:3000`);
- `TWIN_JWT_SECRET`, `TWIN_COOKIE_SECRET`, `TWIN_DATABASE_URL`, `TWIN_REDACT_SECRET` and `TWIN_PROMPT_CANARY`;
- `TWIN_DAILY_SPEND_USD`, which defaults to `5`;
- `CMS_URL`.

The webhook forwarder reads only `TWIN_AGENT_URL`, so a delivery never depends on the other BFF secrets.

**Keep optional variables unset, not empty, outside compose.** `agent/lib/models.ts` reads `process.env` directly at build time. An empty `TWIN_MODEL_FALLBACKS` there produces an empty fallback list instead of the default.

## How to add a skill

1. **Write `skills/<name>/SKILL.md`.** It needs YAML frontmatter with a one-line `description` and a semver `metadata.version`, then the prose:

   ```markdown
   ---
   description: One line on what this skill owns.
   metadata:
     version: "1.0.0"
   ---
   # My skill

   - Rules in my voice, in the second person to the model.
   ```

   `scripts/bundle-skills.ts` rejects a file without a description or with a non-semver version, and it normalises CRLF.
2. **Write `skills/<name>/skill.ts`:**

   ```ts
   import { defineTwinSkill } from '../../agent/lib/skills/define'

   export default defineTwinSkill({
     name: 'my-skill',
     tools: ['search_portfolio'],
     activeWhen: (s) => !s.ended,
   })
   ```

   - `tools` must be names from `TOOL_NAMES`.
   - `activeWhen` is a pure predicate over `ConversationState` (`@repo/twin/contract`). No I/O: it runs in the instructions resolver and in every tool gate.
3. **Register it.**
   - Add the name to `SKILL_NAMES` in `agent/lib/skills/define.ts`. Its position is its place in the prompt.
   - Import the manifest in `agent/lib/skills/registry.ts` and add it to the `manifests` map.

   A missing manifest or SKILL.md throws at startup, not mid-turn.
4. **Run `bun run --cwd apps/agents skills`.** It regenerates `agent/lib/skills/generated.ts`. Every package script (`dev`, `build`, `test`, `check-types`, `eval`, `info`) runs it first.
5. **Add tests and evals.**
   - Extend `tests/skills.test.ts` for the predicate and its order.
   - Add live evals under `evals/skills/<name>/*.eval.ts` (`defineEval` from `eve/evals`, tags `['live', '<name>']`).
   - If the skill changes plumbing (tools, state), add an offline eval in `fixtures/offline/evals/`.
6. **Bump `metadata.version` on every prose change.** The version is rendered into the `<skill name version>` block, so a transcript or trace says which prose produced a reply.

## How to add a tool

**A plain gated tool** (everything except `request_disclosure`):

1. Add the name to `TOOL_NAMES` in `agent/lib/skills/define.ts`.
2. Create `agent/tools/<name>.ts`. The file name is the tool name the model sees.

   ```ts
   import { defineDynamic, defineTool } from 'eve/tools'
   import { z } from 'zod'
   import { getEnv } from '../lib/env'
   import { toolGranted } from '../lib/tool-gate'
   import { untrusted, untrustedKey } from '../lib/untrusted'

   const tool = defineTool({
     description: 'What it does, in my voice, and when not to use it.',
     inputSchema: z.object({ query: z.string().min(3).max(200) }),
     outputSchema: z.object({ text: z.string() }),
     async execute({ query }, ctx) {
       const env = getEnv() // never at module top level: eve evaluates modules at build time
       return { text: await lookUp(query, env) }
     },
     // External or CMS content reaches the model as data, never as instructions.
     toModelOutput: (o) => ({ type: 'text', value: untrusted('my-source', o.text, untrustedKey()) }),
   })

   /** Offered only while a skill granting it is active (spec §5). */
   export default defineDynamic({
     events: {
       'step.started': async (_event, ctx) => ((await toolGranted(ctx.session.id, 'my_tool')) ? tool : null),
     },
   })
   ```

3. Grant it in one skill's `skill.ts` (`tools: [...]`) and describe in that skill's `SKILL.md` when to use it. Bump the version.
4. If the tool should feed call intent, record its use in state, for example `toolsUsed: addUnique(s.toolsUsed, '<name>')` inside `updateConversation`, as `check_availability` does. Then read it in `agent/lib/intent/signals.ts`.
5. **Tool output never reaches the browser.** The BFF filter blanks every tool payload except `schedule_call`'s (`VISIBLE_TOOL` in `apps/web/lib/twin/filter.ts`). A tool whose output needs UI must be added there deliberately, with its fields reviewed.
6. Add unit tests (`tests/`, pglite via `@repo/twin/testing`, mocked HTTP) and, if it changes plumbing, an offline eval.

**A workflow tool** (`defineWorkflowTool`, like `request_disclosure`) is for durable, long-running work: a `task` that survives restarts and keeps the conversation open. Workflow tools can't be wrapped in `defineDynamic`, so they are always offered. Gate them by what they can do, not by visibility: in this repo that means the CMS's tier filter plus a per-session cap. The body is `'use workflow'`, and all I/O, env and database access lives in `'use step'` functions (see `agent/lib/approvals.ts`). Steps must be idempotent: a retried step must not send twice or record twice. eve only compiles workflow directives under the app root, so the offline fixture can't host one. Unit-test the body uncompiled with `workflow` mocked, as `tests/request-disclosure-body.test.ts` does.

## How to add an MCP connection

There are two ways. This repo uses the first.

### A. An authored tool that calls the MCP server (what `search_portfolio` does)

Payload is reached through `callPayloadTool` (`agent/lib/payload-mcp.ts`). It uses the official MCP TypeScript SDK `Client` with `StreamableHTTPClientTransport`, sends a bearer token, applies 5-second connect and call timeouts, and validates the JSON result with zod. The model never sees the MCP surface. It sees one typed tool (`search_portfolio`), and that tool does four things the model couldn't do through raw MCP:

- caches results per session (`twin.search_cache`);
- records cited sources for call intent;
- wraps results in `<untrusted>`;
- is offered only while a skill grants it.

For a new server:

1. Add the URL and secret to `agentsEnvSchema` (`packages/twin/src/env.ts`), `.env.example`, `docker-compose.yml` (`agents.environment`) and `.env.deploy.example`.
2. Write a small client module in `agent/lib/`, modelled on `payload-mcp.ts`: one connection per call, bounded timeouts, and an allowlist of tool names in its type signature.
3. Wrap each call you need in an authored tool, as in [How to add a tool](#how-to-add-a-tool), and grant it in a skill.
4. Add a stub to `fixtures/offline/stubs/` and an offline eval, plus a live eval.

### B. An eve connection (`agent/connections/<name>.ts`)

eve can attach the server itself. The model then finds and calls its tools through `connection_search` and `connection_execute`:

```ts
// agent/connections/github.ts
import { defineMcpClientConnection } from 'eve/connections'
import { getEnv } from '../lib/env'

export default defineMcpClientConnection({
  url: 'https://api.githubcopilot.com/mcp/',
  description: 'My public GitHub repositories: read code and READMEs.',
  auth: { credentialOwner: 'app', getToken: async () => ({ token: getEnv().GITHUB_MCP_TOKEN }) },
  tools: { allow: ['get_file_contents', 'search_code'] }, // read-only allowlist, never `block`
})
```

Read this before you choose B:

- **eve adds `connection_search`/`connection_execute` whenever a static connection exists, even with `defaultTools: false`.** They can't be disabled, and they sit outside `toolGranted` skill gating. A static connection is therefore offered to every visitor on every turn.
- To gate it, make the file a `defineDynamic` connection resolved on `turn.started`. It reads conversation state and returns `null` when no active skill should reach it.
- Tool results come back raw, without `<untrusted>` wrapping or caching.

This repo has no eve connection, so path B has not been exercised here.

**Why connections are allowlisted, never open.** The visitors are anonymous, and anything a connection can do, a prompt injection can ask for. MCP servers routinely mix reads with writes and expose more than the twin needs. The Payload MCP plugin is the example: its generic collection tools run as the API key's user and read every disclosure tier. So the surface is the smallest set of named read tools:

- `tools.allow`, never `block`;
- or, for Payload, a key with only the three twin tools enabled;
- plus server-side filtering wherever data has tiers.

## Tuning call intent

After each final reply, `agent/lib/intent/evaluate.ts` scores the conversation:

- **The classifier label** is `requesting_call`, `hiring_signal`, `evaluating`, `browsing` or `unrelated`. It is `null` when the classifier timed out or failed.
- **Deterministic signals** come from state (`signals.ts`).
- **The weights and thresholds** are `INTENT_WEIGHTS` in `agent/lib/intent/weights.ts`, the single tuning surface. Each weight has its rationale next to it.

The tiers:

- `cold` is below `warmAt` (4); `warm` is from 4; `hot` is from `hotAt` (7).
- `requesting_call` is always `hot`.
- A declined offer caps the score just below warm.
- Once the booking widget is shown, the tier stays where it was.

The tier becomes the digest's `call:` directive. `warm` makes one offer, keyed to its turn; `hot` shows the dialog.

Every evaluation is stored in `twin.intent_evaluations` (score, tier, classification, reasons with their points, signals, latency). The latest evaluation's `outcome` is updated as things happen: `none`, `classifier_timeout`, `offered`, `widget_rendered`, `declined` or `booked`. Tune against real conversations:

```sql
-- How each tier ended.
select tier, outcome, count(*) from twin.intent_evaluations group by 1, 2 order by 1, 2;

-- Which reasons precede an offer, the dialog and a booking (points stripped from the reason text).
select regexp_replace(reason, ' \([^)]*\)$', '') as reason,
       count(*) filter (where outcome = 'offered')         as offered,
       count(*) filter (where outcome = 'widget_rendered') as widget,
       count(*) filter (where outcome = 'booked')          as booked,
       count(*)                                            as total
from twin.intent_evaluations, unnest(reasons) as reason
group by 1 order by total desc;

-- How often the classifier is unavailable, and its latency.
select outcome = 'classifier_timeout' as unavailable, count(*), percentile_cont(0.95) within group (order by latency_ms)
from twin.intent_evaluations group by 1;
```

Change a weight, update its comment, and run `tests/intent.test.ts`.

## Operations

### Model and classifiers

**The chat model.** `twinModel()` uses `@openrouter/ai-sdk-provider`:

- **The model** is `TWIN_MODEL`, with OpenRouter's `models` routing set to `[TWIN_MODEL, ...TWIN_MODEL_FALLBACKS]`. That is how it fails over on provider errors, rate limits and downtime: eve has no fallback list of its own.
- **Data collection:** `provider.data_collection: 'deny'`.
- **Cost:** `usage.include: true`, so OpenRouter reports the cost.
- **Token limits:** each session is limited to 600k input and 60k output tokens. When a session reaches them, eve asks for more budget with a `session-limit` request. The BFF hides that request and ends the conversation.

**The classifier model** (`TWIN_CLASSIFIER_MODEL`) has no fallback chain and does two jobs:

- **The abuse gate** runs in `onMessage`, before dispatch, with `TWIN_ABUSE_TIMEOUT_MS` (1.5 s). **It fails open:**
  - A timeout yields `ok` silently.
  - Any other failure yields `ok` and logs `[twin] abuse classifier failed`. eve turns an `onMessage` throw into HTTP 500 for every visitor, so the gate must not throw.
  - A non-`ok` verdict adds a context note that makes the model deflect once, in character. The conversation ends after 3 violations.
  - `prompt_attack` is counted, not blocked: `boundaries` handles it.
- **The intent label** runs after the reply (`TWIN_CLASSIFIER_TIMEOUT_MS`, 4 s), so it never adds time-to-first-token. Its failures leave the label `null`.

### Spend

**Recording.** `agent/instrumentation/spend.ts` writes **two ledger rows per model call** into `twin.spend_ledger`, because eve reports the two halves on different events with different idempotency keys:

- `model.call.completed` gives the tokens, written with cost 0;
- `step.attempt.metadata` gives the cost, read from OpenRouter's `providerMetadata.openrouter.usage.cost` and written with 0 tokens. eve only fills `costUsd` for the AI Gateway.

**Why the instrumentation records outputs.** `tracePolicy.recordOutputs` is `true` because with it off, eve strips the provider metadata down to `gateway.cost` and the OpenRouter cost disappears. Nothing from the outputs is persisted: the handler stores numbers only.

**Enforcing the cap.** The BFF sums `cost_usd` since 00:00 UTC (`spendSince`) and refuses with `offline` once it reaches `TWIN_DAILY_SPEND_USD`. The check runs before a message is sent, so the call that crosses the cap still completes.

**When the ledger undercounts.** If a ledger write fails, for example during a database outage, eve logs `instrumentation provider failed` and the row is lost, so **the cap undercounts**.

**Set a credit limit on the OpenRouter key** (OpenRouter > Keys > the key > limit) as the hard stop.

Reading the ledger:

```sql
-- Daily totals (UTC), the numbers the cap compares against.
select date_trunc('day', created_at at time zone 'UTC') as day,
       sum(cost_usd) as usd, sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens,
       count(distinct session_id) as sessions
from twin.spend_ledger group by 1 order by 1 desc;

-- Most expensive sessions in the last 7 days.
select session_id, sum(cost_usd) as usd, sum(input_tokens + output_tokens) as tokens
from twin.spend_ledger where created_at > now() - interval '7 days'
group by 1 order by usd desc limit 20;
```

Cost rows carry `model_id = 'openrouter'`, and token rows carry the requested model id.

### Telegram approvals

**How an approval runs.** When a search returns a restricted stub the visitor needs, the model calls `request_disclosure`. That is a durable workflow **task**, so the conversation goes on. Here is what happens next:

1. **Open.** `openApproval` creates or reuses the approval:
   - It is idempotent per tool call (`call_id`), and the same item is never asked about twice in a session.
   - It is capped at 3 per session; past the cap, the request is denied silently.
   - It stores the workflow's webhook URL. The newest webhook wins, so a re-dispatched run is still the one that gets woken.
2. **Notify.** `notifyOwner` sends the Approve/Deny message once; the stored message id prevents a resend. If notification fails, the approval expires.
3. **Wait.** The body races the webhook against `sleep(TWIN_APPROVAL_TIMEOUT)`.
4. **The owner taps a button.** Telegram posts to `https://<web>/api/twin/hooks/telegram`, the BFF forwards it, and the agent:
   - checks the secret header;
   - accepts taps from `TELEGRAM_OWNER_USER_ID` only;
   - **commits the decision to the database first**, then wakes the workflow;
   - edits the Telegram message.
5. **Settle.** `finalizeApproval` trusts only the database. Anything without a recorded owner decision becomes `expired`. That covers the deadline, a stray POST and a failed notification, so **the flow fails closed**. Only `approved` releases the item, through `twinDisclose`; a failed release reads as denied.

Setup:

1. **Create the bot.** In Telegram, message **@BotFather**, send `/newbot`, and copy the token into `TELEGRAM_BOT_TOKEN`.
2. **Find your user id** with **@userinfobot**, and put it in `TELEGRAM_OWNER_USER_ID`.
3. **Send `/start` to your bot once.** Telegram refuses messages to a user who never started the bot (403), and every approval would expire.
4. **Pick a secret** of 16–256 characters from `A-Z a-z 0-9 _ -`, for example `openssl rand -hex 32`, and put it in `TELEGRAM_WEBHOOK_SECRET`.
5. **Register the webhook** against the **web** domain (the agent is not public):

   ```bash
   curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
     -H 'content-type: application/json' \
     -d "{\"url\":\"https://<web>/api/twin/hooks/telegram\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\",\"allowed_updates\":[\"callback_query\"]}"
   # Verify: url, pending_update_count, last_error_message
   curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
   ```

   `allowed_updates: ["callback_query"]` means only button taps are delivered. Run it again whenever the domain or the secret changes.

### Cal.com

The booking dialog embeds `CAL_LINK` with `metadata[bookingRef]`. The ref is `<base64url session id>.<HMAC>`, signed with `TWIN_BOOKING_REF_SECRET`, so a browser can't forge a session in it.

1. **Create the event type** the twin should book, for example a 20-minute intro, and set `CAL_LINK=<user>/<event-slug>`.
2. **Add the webhook** under Cal.com > Settings > Developer > Webhooks:
   - **Subscriber URL:** `https://<web>/api/twin/hooks/cal`.
   - **Secret:** the value of `CAL_WEBHOOK_SECRET`. Cal.com signs the raw body as `X-Cal-Signature-256`, a hex HMAC-SHA256.
   - **Triggers:** **Booking created**, **Booking rescheduled** and **Booking cancelled**. Other triggers are acknowledged and ignored.

How the agent handles a delivery:

- It verifies the signature and the `bookingRef`, upserts `twin.bookings`, and updates the conversation's booking state.
- It sends the session a booking notice, and the twin acknowledges the booking in character.
- **Redeliveries are idempotent.** A repeated event is answered `ok` without a second notice. Cancelled is terminal, and a stale create or reschedule never rolls a booking back.
- A booking without a twin ref, for example one made directly on Cal.com, gets a 2xx and a log line, so Cal.com stops retrying.

### Google free/busy

`check_availability` calls `freeBusy.query` as a service account. It can't see event details or write.

1. In Google Cloud, create a project or reuse one, and enable the **Google Calendar API**.
2. Under **IAM & Admin > Service accounts**, create a service account. Create a JSON key under **Keys > Add key**.
3. Encode the key: `base64 -w0 key.json`. The result goes in `GOOGLE_SERVICE_ACCOUNT_JSON`. Delete the downloaded file afterwards.
4. In Google Calendar, open the owner's calendar **Settings and sharing > Share with specific people**. Add the service account's `client_email` with **See only free/busy (hide details)**.
5. Under **Integrate calendar**, copy the **Calendar ID** into `GOOGLE_CALENDAR_ID`.

### Payload: MCP key and knowledge

**The MCP key.** In the CMS admin (**MCP > API Keys**), create a key for the twin and **enable only the custom tools `twinIdentity`, `twinSearch` and `twinDisclose`**. Leave every collection and global capability off. Here is why:

- The three twin tools filter tiers themselves: never-tier entries are excluded, and restricted entries are returned as stubs.
- The plugin's generic collection tools run as the key's user, and a logged-in user reads every tier (`apps/payload/src/access/disclosure-read.ts`).

Put the key in `PAYLOAD_MCP_API_KEY`.

**Disclosure tiers.** Every portfolio collection (`experiences`, `projects`, `content`, `disciplines`) and **Twin knowledge** (`knowledge`) has a `disclosure` field:

- `public`: the twin may share it;
- `restricted`: it needs the owner's approval in each conversation;
- `never`: the twin never sees it.

**Fill in Twin knowledge:**

- **Facts that aren't portfolio entries:** notice period, rates policy, relocation, work authorisation, preferences. Use the categories `availability`, `compensation`, `logistics`, `background` or `other`, and write each answer in the first person. Restricted `availability` and `compensation` requests feed call intent.
- **`voice` samples:** 3–5 real pieces of the owner's writing, `public`. Up to 5 `voice` entries, in `order`, ground the twin's tone.
- **`never` entries with `redactTerms`:** the exact strings that must never appear in a reply, such as salary figures, client names or an address. The BFF redacts them from every reply. The agent also redacts them from the stored transcript.

### Retention and deletion

- **The daily purge** runs at `0 3 * * *` (`agent/schedules/purge.ts`). It deletes:
  - visitors not seen for 90 days (`TWIN_LIMITS.retentionDays`). The delete cascades to conversations, evaluations, approvals, bookings, transcripts and the search cache;
  - rate-limit windows older than 2 days;
  - spend rows older than 90 days.

  A failure is logged and rethrown, so the run is recorded as failed. The visitor cookie also lasts 90 days.
- **eve run data** is set to `experimental.workflow.retention: 0`: a session-owning run's data is deleted when the run finishes. There are caveats:
  - eve applies it only to session-owning runs. Workflow tools (`request_disclosure`) and session timeouts keep the world's default retention.
  - eve's docs say custom worlds may ignore it. **Nobody has checked whether `@workflow/world-postgres` honours it.**
  - The Postgres world caps hook retention with `WORKFLOW_POSTGRES_HOOK_RETENTION_LIMIT_DAYS`, which defaults to 30.
- **Deletion endpoint:** `DELETE /api/twin/me`, called with the visitor's cookie. It does three things:
  1. It resets each of the visitor's eve sessions. A 404 or 409 counts as already gone.
  2. It deletes the visitor row, which cascades to everything they own.
  3. It clears the cookie and answers 204.

  If a reset fails, nothing is deleted and the answer is a bare 500, so the visitor can retry. A half-deletion never happens silently.

## Testing

| Layer | Command | What it covers |
| --- | --- | --- |
| Unit | `bun run --cwd apps/agents test`, `bun run --cwd packages/twin test` | Logic, queries and workflow steps (no network) |
| Offline evals | see below | Real channels, tools and Postgres world, scripted model, local stubs |
| Live evals | see below | Real model, CMS and integrations, deterministic assertions |

**Unit tests (zero network).** Vitest runs against **pglite**, an in-process Postgres migrated with the real migrations (`@repo/twin/testing`). Every HTTP call is mocked (OpenRouter, MCP, Telegram, Google, Exa). `vitest.config.ts` aliases `workflow` to eve's vendored Workflow SDK, as eve does at build time.

**Offline evals** (`fixtures/offline/`). This is a separate eve app:

- **The model** is a scripted `mockModel` with keyword-driven paths: `BOOK`, `PUSH`, `NO`, `FACT`.
- **The channels and tools** re-export the real ones from `agent/`.
- **Stubs** for Payload MCP (`:4310`) and Telegram (`:4312`) start in the eval setup.
- **The database** is the real Postgres world on `twin_eval`.

The evals cover widget guards, decline, portfolio search and the Cal.com booking webhook. **`request_disclosure` is not in the fixture**, because eve compiles workflow directives only under the app root. Its body is proven by `tests/request-disclosure-body.test.ts` instead, which runs it uncompiled with `workflow` mocked: approved, denied, deadline to expired, notification failure and failed release.

```bash
export TWIN_DATABASE_URL=postgres://twin:twin@127.0.0.1:5433/twin_eval WORKFLOW_POSTGRES_URL=postgres://twin:twin@127.0.0.1:5433/twin_eval
bun run --cwd packages/twin db:migrate && bun run --cwd apps/agents world:setup
cd apps/agents/fixtures/offline && cp .env.example .env && bun run eval   # eve eval --strict --junit .eve/junit.xml
```

**Live evals** (`evals/`) run against a running twin with `eve eval --url`:

- per-skill suites: identity persona, answer depth, grounding, intake, 20 scripted jailbreaks and 20 cold sessions;
- the acceptance path from "are you available?" to a booked call in at most four turns. That path posts a signed Cal.com webhook to `/webhooks/cal`.

The agent is internal, so the evals must run where they can reach it: inside the compose network, for example from the `agents` container, which already has the secrets in its env.

```bash
docker compose exec agents sh -c '
  cd /app/apps/agents &&
  export EVE_EVAL_AUTH_TOKEN=$(bun scripts/mint-eval-token.ts) &&
  bunx eve eval --url http://127.0.0.1:3000 --strict'
```

How it works:

- `scripts/mint-eval-token.ts` signs a one-hour JWT with `TWIN_JWT_SECRET` for the fixed eval visitor `00000000-0000-4000-8000-0000000000e1`. One run needs longer than the visitor's 60 seconds.
- The jailbreak suite needs `TWIN_PROMPT_CANARY`, and the booking acceptance needs `CAL_WEBHOOK_SECRET`. Both must match the target agent.
- Live evals write real conversations, ledger rows and evaluations into the target's database, and they spend model credit.

This command has not been run yet; see [Status](#status).

**CI** (`.github/workflows/ci.yml`) has two jobs.

The `checks` job runs on every push to `main`/`develop` and on every PR:

- `turbo run check-types lint`;
- the twin and agents unit tests;
- Payload integration tests on a throwaway SQLite database (`file:./.tmp/ci.db`, never `payload.db`);
- the web tests;
- the client-bundle scanner's own test;
- `eve info` and `eve build`;
- twin migrations, world setup and the offline evals against a `postgres:17` service on 5433 (`twin_eval`);
- a web build scanned for secrets and prompt fragments (`scripts/scan-client-bundle.ts`).

`live-evals` runs on manual `workflow_dispatch` with a `live_url`. It mints the token from repository secrets and runs `eve eval --url "$LIVE_URL"`. **The URL must be reachable from GitHub's runners, and the production agent is deliberately not.** Point it at a separately exposed, authenticated test deployment, or run the live evals inside the compose network as shown above.

## Where the code differs from the spec

- **The BFF route** is `apps/web/app/api/twin/eve/v1/[...path]/route.ts`, not `apps/web/app/api/twin/[...path]/route.ts`.
- **Payload MCP** is called with the official `@modelcontextprotocol/sdk` client (`agent/lib/payload-mcp.ts`), not `@ai-sdk/mcp`'s `createMCPClient`.
- **Skill activation:**
  - `answer-depth`, `portfolio-recall` and `visitor-intake` deactivate once the conversation has ended.
  - `scheduling` also deactivates once a booking is confirmed.
  - Only `identity` and `boundaries` are unconditional.
- **The skill version** comes from `SKILL.md` (`metadata.version`), not from `defineTwinSkill`.
- **`request_disclosure` is always offered** (workflow tools can't be dynamic). It is not gated by `toolGranted`.
- **There are no eve connections.** "Adding one later is a single file in `agent/connections/`" holds, but see [path B](#b-an-eve-connection-agentconnectionsnamets) for what that file then exposes.
