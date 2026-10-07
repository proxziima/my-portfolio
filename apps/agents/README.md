# Portfolio twin agent (`apps/agents`)

## What it is

A first-person "twin" of the portfolio owner that answers recruiters and clients in the Messenger window on `/os`, using only what the Payload CMS says about the owner. It offers a call when the conversation warrants it, asks the owner over iMessage (Photon) before it shares anything restricted, and shows the Cal.com booker inline. It is an [eve](https://eve.dev) 0.71 agent on OpenRouter with a Postgres-backed durable runtime, designed in [the spec](../../docs/superpowers/specs/2026-10-04-portfolio-twin-agent-design.md); this README describes the code as it is now, and [Where the code differs from the spec](#where-the-code-differs-from-the-spec) lists where the two disagree.

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

- **Unit tests pass locally:** `apps/agents` has 33 files and 197 tests, `packages/twin` has 11 files and 77 tests, and `apps/web` has 65 files and 416 tests, at the commit that last updated these counts.
- **The offline evals pass against local Postgres (`twin_eval`):** 5 evals and 20 gates, with the scripted model and local stubs, at the same commit.
- **The approval timeout has no offline eval.** It is proven by `tests/request-disclosure-body.test.ts` (the real workflow body, `workflow` mocked) plus the step tests in `tests/approval-steps.test.ts`; `eve build` proves the body compiles. See [Where the code differs from the spec](#where-the-code-differs-from-the-spec).
- **CI has the jobs listed under [Testing](#testing).** No CI run result has been reviewed for this README.

What has **not** been verified:

- **No Docker image has been built on the development machine**, which has no Docker. That covers `apps/agents/Dockerfile` and the compose stack (`docker-compose.yml`) with `postgres` and `agents`. CI builds the agent with `eve build` but not the image, so the first real image build happens in Easypanel or on a machine with Docker.
- **The live evals (`evals/`) have not been run against a real model yet.** CI's `live-evals` job runs them against a real model with a throwaway CMS and agent inside the runner (see [Testing](#testing)), but no run of it has been reviewed. It has never run against the production CMS content.
- **Grounding (acceptance criterion 1) is only partly checked:** it is live-eval checked for search-before-text and URL provenance; claim-level grounding relies on the `portfolio-recall` skill. There is no judge check (see [Where the code differs from the spec](#where-the-code-differs-from-the-spec)).
- **None of the external integrations has run end to end against the real service:** Photon approvals, Cal.com webhooks, Google free/busy, OpenRouter fallback routing, and the spend ledger with real OpenRouter cost metadata. Each one is covered by unit tests with mocked HTTP (Photon's adapter is mocked). Payload MCP is also covered by a local stub in the offline evals; Photon has none, so the offline evals leave iMessage unconfigured.
- **`experimental.workflow.retention: 0` has not been verified at runtime on the Postgres world.** eve's docs warn that "Custom Worlds used with eve might not support this feature". The installed `@workflow/world-postgres` implements it (`dist/retention.js` clears the payload columns and stamps `expired_at` for runs started with `$retention: 0`), but no run has been inspected to confirm that the data is gone. See [Retention and deletion](#retention-and-deletion).

## Architecture

### Topology

```
browser ── /os Messenger (eve/react, host /api/twin) ──► web: /api/twin/eve/v1/* (BFF) ──(internal net, 60 s JWT)──► agents: eve start (/eve/v1/*)
                                                         │ signed cookie → visitor, session ownership,               │ OpenRouter (model + classifier)
                                                         │ rate limits and caps, spend cap, output filter            │ Payload MCP (twinIdentity/twinSearch/twinDisclose)
Cal.com ── webhook ──► web /api/twin/hooks/cal ──────────(raw body + signature header)──► agents /webhooks/cal      │ Google freeBusy, Exa, Photon (iMessage)
Photon ─ webhook ──► web /api/twin/hooks/photon ──(raw body + x-spectrum-*)──► agents /webhooks/photon (eve photon channel)   │
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
  - **Canary:** once `TWIN_PROMPT_CANARY` (the system prompt's first line) appears in a text block, every later delta of that block is blanked and its `message.completed` is replaced with `LEAK_DEFLECTION`. The canary is the only marker it blocks.
  - **Resumed streams:** the deltas of a block that started before the cut are blanked, and its `message.completed` carries the redacted text.
  - **Blanking:** reasoning, every tool payload except `schedule_call`'s successful output, every error message, failure details (only `code` survives), usage, `providerMetadata` and `session-limit` prompts are blanked.
  - **Fail closed:** without redaction rules, nothing streams.
  - **Forged context notes:** visitor text has `[context` neutralised (`lib/twin/neutralise.ts`), so it can't forge the agent's `[context, not from the visitor]` notes.

**Webhooks** enter through `apps/web/app/api/twin/hooks/[provider]/route.ts`. That route accepts `cal` and `photon` only. It forwards the raw body plus the headers the provider needs (the signature and event metadata) to `agents /webhooks/<provider>`, and the agent verifies the signature next to the secret: `agent/channels/webhooks.ts` for Cal.com, eve's Photon channel (`agent/channels/photon.ts`) for Photon.

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
  channels/webhooks.ts      POST /webhooks/cal (signature check, idempotent)
  channels/photon.ts        eve's photonIMessageChannel at /webhooks/photon: the owner's approval replies, never an agent turn
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
    search.ts, disclosure.ts, approvals.ts (workflow steps), imessage.ts, imessage-reply.ts, photon-inbound.ts, owner-decision.ts, phone.ts
    google-freebusy.ts, availability.ts, scheduling.ts, booking-ref.ts, booking-transition.ts, cal-webhook.ts
    intent/                 signals.ts, classify.ts, score.ts, weights.ts (INTENT_WEIGHTS), evaluate.ts
    untrusted.ts            <untrusted nonce> wrapping for CMS, web and memory content
    identity.ts, visitor-auth.ts, memory.ts, merge-visitor.ts, transcript.ts, spend.ts, secrets.ts, ...
skills/<name>/              SKILL.md (frontmatter description + metadata.version, then prose) and skill.ts
evals/                      live suite: evals/skills/<skill>/*.eval.ts, evals/acceptance/*, evals/lib/*
fixtures/offline/           offline eval app: scripted mockModel, re-exported real channels and tools,
                            Payload MCP stub (stubs/), evals/*.eval.ts, .env.example
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

You need **PostgreSQL 17 reachable on `127.0.0.1:5433`, with role and database `twin`** (password `twin`). Either:

- run `docker-compose.dev.yml`, or
- use a native or WSL install of PostgreSQL 17 listening on port 5433.

**Always use `127.0.0.1`.** On Windows with WSL, `localhost` resolves to `::1`, which WSL doesn't forward. Check it's up with `pg_isready -h 127.0.0.1 -p 5433`.

There are two databases:

- `twin`: development. The web BFF and the agent behind it share it.
- `twin_eval`: the offline evals, CI's database name, and throwaway `eve dev` runs you don't want mixed into dev data.

`docker-compose.dev.yml` only creates `twin`, so create `twin_eval` yourself:

```bash
docker compose -f docker-compose.dev.yml up -d postgres
docker compose -f docker-compose.dev.yml exec postgres createdb -U twin twin_eval
```

With a native or WSL install, create the role and both databases yourself.

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

- **Set `TWIN_REDACT_SECRET` in `apps/payload/.env`** (listed in `apps/payload/.env.example`) to the same value as in the agent and web env. Without it, `/api/twin/redact-terms` answers 401, the BFF streams nothing, and the agent can't store transcripts.
- **Create the MCP key** in the admin with only the three twin tools (see [Payload](#payload-mcp-key-and-knowledge)).
- **The CMS dev server pushes its schema into `apps/payload/payload.db` on start.** Never reset or delete `payload.db`. Before anything that changes the CMS schema, back it up next to it: `cp apps/payload/payload.db apps/payload/payload.db.pre-<label>-$(date +%Y%m%d%H%M%S).bak`. Generate migrations against a throwaway database, as described in [docs/deploy-easypanel.md](../../docs/deploy-easypanel.md#updating).

### 3. The agent's `.env`

```bash
cp apps/agents/.env.example apps/agents/.env
```

Fill every required value (see the [Env manifest](#env-manifest)). `eve dev` loads `.env.development.local`, `.env.local`, `.env.development` and `.env`, and Bun loads `.env` for `bun run` scripts. Keep `CMS_URL=http://localhost:3001` and `PAYLOAD_MCP_URL=http://localhost:3001/api/mcp` for the local CMS.

### 4a. The terminal UI

```bash
bun run --cwd apps/agents dev                # bun run skills && eve dev --port 4100 --no-default-extensions
```

`--no-default-extensions` keeps eve's bundled dev extensions off. The main one, self-modification, adds a `self-modification__agent` subagent that edits files under `agent/` on request. Visitors reach this same dev server through the Messenger, so the extension would let a chat message rewrite the twin's source. Never remove the flag.

eve's TUI talks to the agent as the `local-dev` principal, which maps to the fixed visitor `00000000-0000-4000-8000-000000000001` (`DEV_VISITOR_ID`), created on demand. Every configured capability runs for real: OpenRouter, the CMS, and whichever of Google, Exa, Cal.com and iMessage are set.

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
| `TWIN_MODEL` | A | `deepseek/deepseek-v4.1-flash` | Primary (standard tier) model | OpenRouter model id |
| `TWIN_MODEL_FALLBACKS` | A | `anthropic/claude-haiku-4.5` | Comma list, OpenRouter `models` fallback chain | OpenRouter model ids |
| `TWIN_MODEL_CONTEXT_TOKENS` | A | `1000000` | Context window of the standard tier (not in eve's catalog) | The primary model's context window |
| `TWIN_MODEL_LIGHT` | A | `deepseek/deepseek-v4.1-flash` | Light tier: greetings, small talk, logistics, deflections | OpenRouter model id |
| `TWIN_MODEL_LIGHT_CONTEXT_TOKENS` | A | `1000000` | Context window of the light tier | The light model's context window |
| `TWIN_MODEL_DEEP` | A | `anthropic/claude-opus-5.5` | Deep tier: in-depth technical questions | OpenRouter model id |
| `TWIN_MODEL_DEEP_CONTEXT_TOKENS` | A | `1000000` | Context window of the deep tier | The deep model's context window |
| `TWIN_CLASSIFIER_MODEL` | A | `openai/gpt-4.1-mini` (falls back to `anthropic/claude-haiku-4.5`) | Pre-turn gate (abuse, scope, depth); pick a model that answers in well under the gate timeout | OpenRouter model id |
| `TWIN_INTENT_MODEL` | A | `anthropic/claude-haiku-4.5` (falls back to `deepseek/deepseek-v4.1-flash`) | Post-reply call-intent label; re-run the intent-label eval before changing it | OpenRouter model id |
| `TWIN_CLASSIFIER_TIMEOUT_MS` | A | `4000` | Intent label timeout (post-reply) | – |
| `TWIN_ABUSE_TIMEOUT_MS` | A | `2500` | Pre-turn gate timeout (fails open to `ok`/`standard`) | – |
| `TWIN_JWT_SECRET` | A, W | required, ≥ 32 chars | HS256 key of the 60 s visitor JWT | `openssl rand -hex 32` |
| `TWIN_PROMPT_CANARY` | A, W | required, ≥ 16 chars | Prompt marker the BFF blocks | `openssl rand -hex 16` |
| `TWIN_STABLE_KEY_SECRET` | A | required, ≥ 32 chars | HMAC of a volunteered email (returning visitors) | `openssl rand -hex 32` |
| `TWIN_REDACT_SECRET` | A, W, C | required, ≥ 32 chars | Bearer for `GET /api/twin/redact-terms` | `openssl rand -hex 32` |
| `CMS_URL` | A, W | required | CMS origin (redaction rules) | `http://cms:3001` in compose (agents) |
| `PAYLOAD_MCP_URL` | A | required | Payload MCP endpoint | `<cms>/api/mcp` |
| `PAYLOAD_MCP_API_KEY` | A | required | MCP key with only the three twin tools | CMS admin > MCP > API Keys |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | A | google integration | base64 JSON key (`client_email`, `private_key`) | Google Cloud > Service accounts > Keys |
| `GOOGLE_CALENDAR_ID` | A | google integration | Calendar queried with `freeBusy` | Calendar settings > Integrate calendar |
| `OWNER_TIMEZONE` | A | required, IANA zone | Owner's zone for availability and the dialog | e.g. `America/Sao_Paulo` |
| `CAL_LINK` | A | cal integration, `<user>/<slug>` | Event the booking dialog embeds | Cal.com event type URL |
| `CAL_ORIGIN` | A | `https://cal.com` | Cal origin (self-hosted only) | – |
| `CAL_EMBED_SCRIPT_URL` | A | `https://app.cal.com/embed/embed.js` | Embed loader (self-hosted only) | – |
| `CAL_WEBHOOK_SECRET` | A | cal integration, ≥ 32 chars | Verifies `X-Cal-Signature-256` | Set on the Cal.com webhook |
| `TWIN_BOOKING_REF_SECRET` | A | cal integration, ≥ 32 chars | Signs the `bookingRef` metadata | `openssl rand -hex 32` |
| `IMESSAGE_PROJECT_ID` | A | imessage integration | Photon project id: sends the approval texts and starts the channel's adapter | app.photon.codes > your project |
| `IMESSAGE_PROJECT_SECRET` | A | imessage integration | Photon project secret | app.photon.codes > your project |
| `IMESSAGE_WEBHOOK_SECRET` | A | imessage integration | Verifies `X-Spectrum-Signature` on `/webhooks/photon` | Shown once when you create the Photon webhook |
| `OWNER_PHONE_NUMBER` | A | imessage integration, E.164 | The only number whose replies decide approvals | Your own phone |
| `TWIN_APPROVAL_TIMEOUT` | A | `15m` (`<n>s/m/h`) | Approval deadline before auto-deny | – |
| `EXA_API_KEY` | A | exa integration | `web_search` | exa.ai dashboard |

**Integrations are optional, each all or nothing** (`INTEGRATIONS` in `packages/twin/src/env.ts`). The twin chats with none of them set. A half-set integration fails at startup and names the missing variables. While one is off:

| Integration | Effect |
|---|---|
| `google` | `check_availability` is never offered |
| `cal` | `schedule_call` is never offered; `/webhooks/cal` answers 404 |
| `imessage` | searches drop restricted entries before caching, so nothing restricted is offered and `request_disclosure` refuses without contacting anyone; `/webhooks/photon` deliveries fail (with iMessage off the channel's adapter can't initialise, so the route answers an error) |
| `exa` | `web_search` is never offered |

The web BFF reads `webTwinEnvSchema`, from the same file:

- `TWIN_AGENT_URL` (the internal agent URL; compose uses `http://agents:3000`);
- `TWIN_JWT_SECRET`, `TWIN_COOKIE_SECRET`, `TWIN_DATABASE_URL`, `TWIN_REDACT_SECRET` and `TWIN_PROMPT_CANARY`;
- `TWIN_DAILY_SPEND_USD`, which defaults to `5`;
- `CMS_URL`.

The webhook forwarder reads only `TWIN_AGENT_URL`, so a delivery never depends on the other BFF secrets.

**An empty or blank optional variable counts as unset.** Compose renders `${VAR:-}` as `''`, so this matters in production. `parseEnv` and `agent/lib/models.ts` share `blankToUndefined` from `@repo/twin/env`. `models.ts` reads `process.env` at build time, outside the schema. An empty `TWIN_MODEL_FALLBACKS` therefore keeps the default fallback chain, and an empty `TWIN_MODEL_CONTEXT_TOKENS` keeps the default window.

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

- **eve adds `connection_search`/`connection_execute` whenever the agent has a static connection or a dynamic connection resolver, even with `defaultTools: false`.** eve's built-in tools page says: "eve adds both when the agent has a static connection or a dynamic connection resolver, even when `defaultTools` is `false`", and "An agent without connections has neither tool." The tools "cannot be replaced or disabled", and they sit outside `toolGranted` skill gating. A static connection is therefore offered to every visitor on every turn.
- To gate the connection itself, make the file a `defineDynamic` connection resolved on `turn.started`. It reads conversation state and returns `null` when no active skill should reach it. **That does not remove the two tools.** A resolver that returns `null` still leaves `connection_search` and `connection_execute` in the tool list, with nothing behind them.
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
- No label forces a tier. `requesting_call` weighs 3, below `hotAt`: an explicit ask is already handled in the same reply by the main model (the scheduling skill's explicit-request rule, `schedule_call` with trigger `explicit_request`), so the post-reply label only corroborates, and one misread reaches `warm` at most.
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

**The chat model.** `tierModel(tier)` uses `@openrouter/ai-sdk-provider`; `twinModel()` is the standard tier (see [Model routing](#model-routing)):

- **The model** is `TWIN_MODEL` (standard tier), with OpenRouter's `models` routing set to `[TWIN_MODEL, ...TWIN_MODEL_FALLBACKS]`. That is how it fails over on provider errors, rate limits and downtime: eve has no fallback list of its own.
- **Data collection:** `provider.data_collection: 'deny'`.
- **Cost:** `usage.include: true`, so OpenRouter reports the cost.
- **Token limits:** each session is limited to 600k input and 60k output tokens. When a session reaches them, eve asks for more budget with a `session-limit` request. The BFF hides that request and ends the conversation.

#### Model routing

Each turn runs on the cheapest model that answers it well. The tier is chosen before the turn starts and applied by `agent/agent.ts`.

| Tier | Default model | Window | Used for |
| --- | --- | --- | --- |
| `light` | `deepseek/deepseek-v4.1-flash` | 1M | Greetings, small talk, thanks, logistics, simple facts; every off-scope or abusive message; the closing turn of an ended conversation |
| `standard` | `deepseek/deepseek-v4.1-flash` (`TWIN_MODEL`) | 1M | Explaining the owner's work, projects, experience and opinions |
| `deep` | `anthropic/claude-opus-5.5` | 1M | Architecture, system design, trade-offs, debugging reasoning, and short follow-ups inside such a thread |

- **How the tier is chosen.** The abuse gate's single classifier call returns `{ verdict, depth }`. It sees the previous exchange (from `recentTurns`, 600 characters each) to judge depth only. The message and the exchange are fenced in `<message>` and `<previous>` tags, with angle brackets stripped from the visitor's text, and the system prompt calls their content data to classify, never instructions. The channel writes `modelTier` to the conversation state: `light` whenever the verdict is not `ok`, otherwise the classifier's `depth`. `agent.ts` sets `model` to `defineDynamic` with a `step.started` handler. It reads `modelTier` with `currentTier` and returns `tierSelection(tier)`: the OpenRouter model, its context window and its reasoning effort (`low`, `low`, `medium`). The channel stamps each write with when the message began classifying (`modelTierAt`) and, under the row lock, writes only if no later message has already written, so classifications that finish out of order can't leave the older tier. With `steer`, a message sent mid-turn rewrites the tier and the model follows from the next step on: the latest message wins, and a turn's steps are not guaranteed to share one model.
- **Fallbacks.** Each tier fails over through the tiers below it, then `TWIN_MODEL_FALLBACKS`, de-duplicated: deep is `[deep, standard, ...fallbacks]`, standard is `[standard, ...fallbacks]`, light is `[light, ...fallbacks]`. A classifier timeout or failure gives `{ ok, standard }`, and a failed tier read gives `standard`: both are the behaviour before routing.
- **Compaction** summarizes on the standard tier with its explicit window (`compaction.model` and `compaction.modelContextWindowTokens`), whichever tier the turn ran on.
- **Why not eve's `auto()`:**
  - It cannot carry a context window, and OpenRouter models are not in the AI Gateway catalog, so every routed turn would fail for lack of window metadata.
  - It assumes Vercel AI Gateway and a paid evaluator, and the API is experimental.
  - It adds a model call per turn, when the gate already runs one.
- **Model ids stay server-side.** eve's `step.started` events carry `modelId`; the web filter (`apps/web/lib/twin/filter.ts`) blanks it, because the boundaries forbid revealing models and the id would reveal the tier.
- **Prompt cache.** Changing model between turns loses the provider's prompt cache. Conversations are short, so the cost is small.
- **Live eval.** `evals/skills/routing/routing.eval.ts` (tags `live`, `routing`) asserts the `modelId` of each turn's `step.started` events.

**Two classifier models**, one per job, each with one fallback through OpenRouter `models` for a provider outage. Only Anthropic, DeepSeek and OpenAI models are used (owner policy). The gate (`TWIN_CLASSIFIER_MODEL`, `openai/gpt-4.1-mini`) falls back to `anthropic/claude-haiku-4.5`; the intent label (`TWIN_INTENT_MODEL`, `anthropic/claude-haiku-4.5`) falls back to `deepseek/deepseek-v4.1-flash`. They are separate because they were benchmarked on different tasks: the gate's model is the faster one, and it misread the twin's own call offer as the visitor asking:

- **The abuse gate** runs in `onMessage`, before dispatch, with `TWIN_ABUSE_TIMEOUT_MS` (2.5 s). **It fails open:**
  - A timeout yields `ok` on the `standard` tier, silently.
  - Any other failure yields `ok` on the `standard` tier and logs `[twin] abuse classifier failed`. eve turns an `onMessage` throw into HTTP 500 for every visitor, so the gate must not throw.
  - A non-`ok` verdict adds a context note that makes the model deflect once, in character. The conversation ends after 3 violations.
  - `prompt_attack` is counted, not blocked: `boundaries` handles it.
- **The intent label** runs after the reply (`TWIN_CLASSIFIER_TIMEOUT_MS`, 4 s), so it never adds time-to-first-token. Its failures leave the label `null`. Its prompt (`INTENT_SYSTEM` in `agent/lib/intent/classify.ts`) keeps `requesting_call` for a live conversation: asking the owner to tell or talk about something ("fala mais", "tell me more") is information, and the twin's own call offer never counts as the visitor asking.
- **Choosing the intent model.** `evals/skills/scheduling/intent-label.eval.ts` (tags `live`, `scheduling`) calls `classifyIntent` directly on the multi-turn PT/EN regression set in `intent-label.json`, so it checks the model and prompt without the agent. Re-run it (`bunx eve eval skills/scheduling/intent-label`) before changing `TWIN_INTENT_MODEL` or the prompt, and add every misread from production to the set. The default was picked on 2026-10-05 among Anthropic, DeepSeek and OpenAI models (the owner allows no others): the most accurate model with p90 under 3 s, the cheaper on a tie. `anthropic/claude-haiku-4.5` was the only one with no miss (150/150 over two runs of 3, p50 1.2 s, p90 1.5 s); the OpenAI models labelled the warm-offer case `requesting_call`.
- **Choosing the gate model.** Same method on 15 single messages (greeting, own work, a deep technical question, five unseen leads that must be `ok`, four off-scope requests, a prompt attack, harassment): the most accurate model whose p90 leaves margin under `TWIN_ABUSE_TIMEOUT_MS` (2.5 s). `openai/gpt-4.1-mini` and `openai/gpt-4o-mini` were both 90/90 over two runs of 3; gpt-4.1-mini was kept for its lower latency (p90 1.5-1.6 s against 1.8-2.0 s), since the gate's latency is time-to-first-token and the price gap is a fraction of a cent per thousand messages.

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

### iMessage approvals

**How an approval runs.** When a search returns a restricted stub the visitor needs, the model calls `request_disclosure`. That is a durable workflow **task**, so the conversation goes on. Here is what happens next:

1. **Open.** `openApproval` creates or reuses the approval:
   - It is idempotent per tool call (`call_id`), and the same item is never asked about twice in a session.
   - It is capped at 3 per session; past the cap, the request is denied silently.
   - It only opens for a `sourceId` that one of this session's cached searches listed as restricted. Anything else is `notOffered`, denied without notifying anyone. The row's topic is the CMS stub's topic, never the model's words.
   - It draws a 4-character **reply code** from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0/O or 1/I/L), unique among pending approvals; a collision redraws up to 5 times.
   - It stores the workflow's webhook URL. The newest webhook wins, so a re-dispatched run is still the one that gets woken.
2. **Notify.** `notifyOwner` texts the owner once through Photon, then sets `notified_at`, so a retry never texts twice. If notification fails for good, the approval expires. The text holds the CMS topic, the item id and the code only: the model's `reason` is visitor-steerable, so it is kept on the row for audit and never shown next to the question.

   ```
   Twin approval request
   Topic: Notice period
   Item: knowledge:5
   Reply YES K7Q2 to share or NO K7Q2 to decline. Auto-denies after 15m.
   ```
3. **Wait.** The body races the webhook against `sleep(TWIN_APPROVAL_TIMEOUT)`.
4. **The owner replies.** Photon posts to `https://<web>/api/twin/hooks/photon`, the BFF forwards it, and eve's Photon channel verifies `X-Spectrum-Signature`. Its `onMessage` (`agent/lib/photon-inbound.ts`):
   - accepts messages from `OWNER_PHONE_NUMBER` only, in a direct chat (after E.164 normalisation);
   - parses the text with a fixed grammar, no model involved;
   - **commits the decision to the database first**, then wakes the workflow;
   - answers on the same thread with a short confirmation, best effort;
   - returns `null`, so no agent turn ever starts on this channel.
5. **Settle.** `finalizeApproval` trusts only the database. Anything without a recorded owner decision becomes `expired`. That covers the deadline, a stray POST and a failed notification, so **the flow fails closed**. Only `approved` releases the item, through `twinDisclose`; a failed release reads as denied.

**Replies.** The text is trimmed, upper-cased and stripped of trailing `.`, `!` and `?`.

| Owner sends | Result |
| --- | --- |
| `YES K7Q2`, `Y K7Q2`, `APPROVE K7Q2`, `OK K7Q2` | Approves K7Q2: "Approved K7Q2: Notice period." |
| `NO K7Q2`, `N K7Q2`, `DENY K7Q2` | Denies K7Q2: "Denied K7Q2: Notice period. Nothing was shared." |
| a code that settled in the last 24 hours | "K7Q2 already expired; nothing was shared." or "K7Q2 was already approved." |
| a code that matches nothing | "No approval ZZZZ is waiting." |
| a bare `YES` or `NO`, or anything else | "Reply YES <code> or NO <code>. Waiting: K7Q2 (Notice period)." (up to 3 codes), or "Nothing is waiting for approval." |

**Only coded replies decide.** A bare `YES` or `NO` never approves or denies, even with a single approval pending: the owner gets the help text, which lists only the codes already texted. Photon's webhook payload has no service field (iMessage vs SMS or RCS), so sender authenticity can't be established and a bare reply can't be told from an SMS spoof. The code reached nobody but the owner.

**Who counts.** Only `OWNER_PHONE_NUMBER`. A message from any other number, a group chat, a bot or an echo of our own text is ignored: strangers are never answered, because a reply confirms the line is live, and the number is not logged. Photon is answered 200 before any of this runs, so nothing is redelivered.

**Late replies.** After the deadline the approval is `expired` and stays closed: a reply cannot revive it, and a coded reply gets "already expired; nothing was shared." The prompt states the deadline, and no "expired" text is sent.

**When recording fails.** If the database write fails, the owner is asked "That reply could not be recorded. Send it again." (best effort), and the owner resends the code. A resent coded decision is delivered to the workflow and confirmed again.

Setup:

1. **Create a Photon project** at app.photon.codes (the free tier works) and copy the project id and secret into `IMESSAGE_PROJECT_ID` and `IMESSAGE_PROJECT_SECRET`.
2. **Create a webhook** for `https://<web>/api/twin/hooks/photon` (event `messages`) against the **web** domain, since the agent is not public. Copy the signing secret Photon shows once into `IMESSAGE_WEBHOOK_SECRET`. The BFF forwards the raw body plus `content-type`, `x-spectrum-signature`, `x-spectrum-timestamp`, `x-spectrum-event` and `x-spectrum-webhook-id`. Update the webhook whenever the domain changes.
3. **Set your own number** in E.164 as `OWNER_PHONE_NUMBER`. All four variables are required together.
4. **Text the Photon line once from your iPhone.** The free tier is a shared line (up to 10 users), and a shared line can only message a number after that number has texted the line first.
5. **On the iPhone, set Settings > Messages > Send & Receive > "Start New Conversations From"** to your phone number. An Apple ID email address can't match `OWNER_PHONE_NUMBER`, so those replies would be ignored.

**Why it is built this way.**

- **Inbound is eve's Photon channel**, as in the personal-agent-template reference and eve's "Other hosts" example (lazy credentials, `route: '/webhooks/photon'`). The one difference is `onMessage`: the owner is answering about *another* session (the visitor's), and eve's human-in-the-loop resumes the *requesting* session through *its* channel, which is the visitor's Messenger window. So `onMessage` decides the approval itself and returns `null` instead of dispatching a turn.
- **Outbound is the provider API**, per eve's durable cross-channel notifications pattern: `agent/lib/imessage.ts` calls `openDM(owner)` and `postMessage` on `@photon-ai/chat-adapter-imessage` 3.2.0, the adapter eve bundles, so the owner needn't have a live session. An unconfigured integration is a `FatalError` (no retry). The adapter exposes no permanent-error classification, so its failures stay retryable (`Photon send failed`) and the workflow step retries them.
- **Bare replies don't decide** because Photon's payload has no service field, so the agent can't tell a real iMessage from a spoofed SMS (see above); the code is the proof.
- **The decision is in** [the iMessage spec](../../docs/superpowers/specs/2026-10-05-imessage-owner-approvals-design.md).

**Restart after a failed first initialisation.** The channel's adapter initialises on the first webhook after boot, issuing Photon tokens, *before* the signature is verified. If that first initialisation fails (a Photon or network outage), Chat SDK caches the failure and `/webhooks/photon` keeps answering 500 until the agents service restarts. After an outage, restart `agents`.

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

**Disclosure tiers.** Every portfolio collection (`experiences`, `projects`, `content`, `disciplines`) and the **Knowledge base** (`knowledge`, under **Context** in the admin) has a `disclosure` field:

- `public`: the twin may share it;
- `restricted`: it needs the owner's approval in each conversation;
- `never`: the twin never sees it.

**Fill in the Knowledge base:**

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
  - eve's docs say custom worlds may ignore it. `@workflow/world-postgres` implements it (`dist/retention.js` clears the payload columns of a finished run and stamps `expired_at`), but this is **implemented in the package, not yet verified at runtime** here.
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

**Unit tests (zero network).** Vitest runs against **pglite**, an in-process Postgres migrated with the real migrations (`@repo/twin/testing`). Every HTTP call is mocked (OpenRouter, MCP, Google, Exa), and Photon's adapter is mocked. A setup file (`@repo/twin/testing/network-guard`, in both `packages/twin` and `apps/agents`) replaces global `fetch` with a guard: an un-mocked call rejects and fails the test in `afterEach`, even if the code under test swallowed the error. `vi.stubGlobal('fetch', ...)` replaces the guard and unstubbing restores it. `vitest.config.ts` aliases `workflow` to eve's vendored Workflow SDK, as eve does at build time.

**Offline evals** (`fixtures/offline/`). This is a separate eve app:

- **The model** is a scripted `mockModel` with keyword-driven paths (`BOOK`, `PUSH`, `NO`, `FACT`), one per routing tier, picked per step by the real `currentTier` through `defineDynamic`.
- **The channels and tools** re-export the real ones from `agent/`.
- **A stub** for Payload MCP (`:4310`) starts in the eval setup. Photon has none (it is gRPC, with no HTTP stub), so the fixture leaves iMessage unconfigured: restricted entries are never offered there.
- **The database** is the real Postgres world on `twin_eval`.

The evals cover widget guards, decline, portfolio search, the Cal.com booking webhook and the dynamic model resolver (the fixture's gate times out by design, so every step must start on the standard mock). **`request_disclosure` is not in the fixture**, because eve compiles workflow directives only under the app root. Its body is proven by `tests/request-disclosure-body.test.ts` instead, which runs it uncompiled with `workflow` mocked: approved, denied, deadline to expired, notification failure, failed release and an item the session was never offered.

```bash
export TWIN_DATABASE_URL=postgres://twin:twin@127.0.0.1:5433/twin_eval WORKFLOW_POSTGRES_URL=postgres://twin:twin@127.0.0.1:5433/twin_eval
bun run --cwd packages/twin db:migrate && bun run --cwd apps/agents world:setup
cd apps/agents/fixtures/offline && cp .env.example .env && bun run eval   # eve eval --strict --junit .eve/junit.xml
```

**Live evals** (`evals/`) run against a running twin with `eve eval --url`:

- per-skill suites: identity persona, answer depth, grounding, intake, 20 scripted jailbreaks and 20 cold sessions;
- the acceptance path from "are you available?" to a booked call in at most four turns. That path posts a signed Cal.com webhook to `/webhooks/cal`.

The agent is internal, so the evals must run where they can reach it. CI starts its own CMS and agent (below). Against the deployed stack, run them inside the compose network, for example from the `agents` container, which already has the secrets in its env.

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

This command has not been run against the deployed stack yet; see [Status](#status).

**CI** (`.github/workflows/ci.yml`; the whole pipeline is in [docs/ci-cd.md](../../docs/ci-cd.md)) covers the agent in two places.

The `agents` job runs when the agent is affected: `eve info` and `eve build`, then twin migrations, world setup and the offline acceptance evals (scripted model, local stubs) against a `postgres:17` service on 5433 (`twin_eval`). If it fails, the `agents-evals` artifact has the offline JUnit report.

`live-evals` runs on pushes to `main` and on manual `workflow_dispatch`, after `ci-ok`, and only when the `OPENROUTER_API_KEY` repository secret is set: the `changes` job exports that as a boolean output, because a job-level `if` can't read secrets. It never touches production. Everything runs inside the runner:

1. **Secrets.** Random values are generated and masked (`.github/actions/secrets`). Only `OPENROUTER_API_KEY` and `EXA_API_KEY` come from repository secrets. Without `EXA_API_KEY`, a placeholder keeps the env valid, since no live eval asserts on web search.
2. **A throwaway Payload CMS** (`.github/actions/cms`, on an empty SQLite file under `.tmp/`, never `payload.db`) is built and seeded with `NODE_ENV=production`, so the first start applies the committed migrations (`prodMigrations`). `src/seed/twin-ci.ts` then adds one public `availability` fact, one `voice` sample, and a CI user with an MCP API key that has only `twinIdentity`, `twinSearch` and `twinDisclose` enabled (Payload's `useAPIKey` auth). The key is masked and exported as `PAYLOAD_MCP_API_KEY`.
3. **The agent** is built and runs `world:setup` and `db:migrate` against the same kind of `postgres:17` service, then starts on `:4100`. `CMS_URL` and `PAYLOAD_MCP_URL` point at the local CMS. Google is stubbed with harmless placeholders; iMessage is left unconfigured, so nothing restricted is offered and no approval runs. The live suite has no free/busy eval either. If the model calls `check_availability` during the booking acceptance, that call fails, and the model has to go on without it.
4. **The evals.** Once `/eve/v1/health` answers, the job mints the eval token (`scripts/mint-eval-token.ts`) and runs `bunx eve eval --url http://127.0.0.1:4100 --strict --junit .eve/junit.xml` from `apps/agents`. The `live-evals` artifact has the JUnit report plus the CMS and agent logs from `ci-logs/`.

## Where the code differs from the spec

- **The owner-approval transport** is iMessage via Photon, not Telegram. [The 2026-10-05 spec](../../docs/superpowers/specs/2026-10-05-imessage-owner-approvals-design.md) supersedes the Telegram transport of the 2026-10-04 spec (`request_disclosure`, §6); the rest of the approval design is unchanged.
- **The BFF route** is `apps/web/app/api/twin/eve/v1/[...path]/route.ts`, not `apps/web/app/api/twin/[...path]/route.ts`.
- **Payload MCP** is called with the official `@modelcontextprotocol/sdk` client (`agent/lib/payload-mcp.ts`), not `@ai-sdk/mcp`'s `createMCPClient`.
- **Skill activation:**
  - `answer-depth`, `portfolio-recall` and `visitor-intake` deactivate once the conversation has ended.
  - `scheduling` also deactivates once a booking is confirmed.
  - Only `identity` and `boundaries` are unconditional.
- **The skill version** comes from `SKILL.md` (`metadata.version`), not from `defineTwinSkill`.
- **`request_disclosure` is always offered** (workflow tools can't be dynamic). It is not gated by `toolGranted`.
- **There are no eve connections.** "Adding one later is a single file in `agent/connections/`" holds, but see [path B](#b-an-eve-connection-agentconnectionsnamets) for what that file then exposes.
- **No offline approval-timeout eval.** The spec lists one, but eve compiles workflow directives only under the app root, so `request_disclosure` can't live in `fixtures/offline/`. The timeout path is proven by `tests/request-disclosure-body.test.ts` (the uncompiled body with `workflow` mocked: the deadline resolves, the outcome is `expired`) plus the step tests in `tests/approval-steps.test.ts`; `eve build` proves the body compiles.
- **No judge check for grounding.** eve's judge needs an AI SDK `EvaluationModel`, and the OpenRouter provider has none. The grounding eval (`evals/skills/portfolio-recall/`) checks that `search_portfolio` is requested before any text and that every URL in the reply came from the search output. Acceptance criterion 1 is therefore live-eval checked for search-before-text and URL provenance; claim-level grounding relies on the `portfolio-recall` skill.
- **The BFF blocks the canary only.** There are no other "banned leakage markers": the output filter matches `TWIN_PROMPT_CANARY` (case-insensitive) and silences the rest of that block.
- **Three MCP tools, not two:** `twinIdentity` (owner identity and voice samples for the `identity` skill) joins `twinSearch` and `twinDisclose`.
- **`check_availability({ startDate, days })`**, not `check_availability({ from, to })`: `startDate` is `YYYY-MM-DD` (default today in the owner's time zone, up to 90 days ahead) and `days` is 1 to 14 (default 7).
- **Hook and instrumentation files.** The spec's `hooks/intent.ts`, `hooks/transcript.ts` and `hooks/usage.ts` are `agent/hooks/conversation.ts` (turn bookkeeping, transcript and the post-reply intent evaluation) and `agent/instrumentation/spend.ts` (the spend ledger).
- **CI migration drift is checked.** The `drift` job fails when the Drizzle schema or the Payload config changes without a generated migration (see [docs/ci-cd.md](../../docs/ci-cd.md)).
- **Classifier calls are not in the spend ledger.** The abuse gate and the intent label call `generateText` directly, outside eve's instrumentation, so their cost never reaches `twin.spend_ledger` and the daily cap undercounts by that much. The OpenRouter key's credit limit still covers them.
- **The abuse gate adds latency.** It runs before dispatch, so every message waits up to `TWIN_ABUSE_TIMEOUT_MS` (2.5 s by default) before the model call starts: time-to-first-token grows by the classifier's latency.
- **`request_disclosure` takes `{ sourceId, reason }`.** The spec's model-supplied topic is gone: the topic shown to the owner and stored on the approval comes from the CMS stub this session's search listed, and a `sourceId` the session was never offered as restricted is denied.
