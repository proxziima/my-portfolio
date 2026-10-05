# Portfolio Twin Agent — Design

> Owner-approval transport superseded on 2026-10-05: Telegram mentions below are historical; see [2026-10-05-imessage-owner-approvals-design.md](2026-10-05-imessage-owner-approvals-design.md).

Date: 2026-10-04 · Branch: `feat/portfolio-twin-agent` · Status: decided (owner asked for no question gates)

## 0. Summary

A first-person "twin" of the owner (Vinicius Queiroz) runs behind the existing **MSN Messenger app on `/os`**
(`apps/web/features/os/apps/messenger/`). It answers questions about the owner's career, projects and
availability, grounded only in Payload CMS content. It offers a call when the conversation warrants it and
renders the Cal.com booker inline as an MSN-era dialog.

- **Agent:** an eve agent in `apps/agents` (eve **0.71.0**, docs bundled at `node_modules/eve/docs`, the
  source of truth for every eve API below). The `eve init` sample content is replaced.
- **Model:** the AI SDK v7 OpenRouter provider.
- **Persistence:** one Postgres instance holds eve's durable runtime (the Workflow Postgres world) and
  the app's own `twin` schema.
- **Client:** the Messenger `Conversation` window talks to the agent through `eve/react`, behind a thin
  backend-for-frontend (BFF) in `apps/web`.
- **Reference template:** `vercel-labs/personal-agent-template` (Nuxt) is a **pattern reference only**:
  file-per-capability layout, `defineDynamic` instructions, tool-specific UI parts, a session-resume
  wrapper. The stack stays this monorepo (Next.js 16, Payload 3.90, bun, turbo).

## 1. Verified facts that shaped the design

| Fact (source) | Consequence |
|---|---|
| eve `model` accepts any AI SDK `LanguageModel`; the AI Gateway is only for string ids (`agent-config.md`). | Use `createOpenRouter()` from `@openrouter/ai-sdk-provider@3.1.0` (peer `ai@^7`). Set `modelContextWindowTokens` explicitly. |
| eve has **no model-fallback list** (`agent-config.md`, `guides/evaluate.md`). | Fallback is OpenRouter's documented `models: [...]` routing (`providerOptions.openrouter.models`). It fails over on provider errors, rate limits and downtime. |
| Default tools include `bash`, `read_file`, `write_file`, `web_fetch`, `web_search`, `agent`, `load_skill` (`concepts/built-in-tools.md`). | `defaultTools: false`. Only authored tools plus opt-in `no_reply` are exposed. Unsafe tools never reach anonymous visitors. |
| `web_search` built-in works only through Gateway (Exa or Parallel) or providers with native search. | Author `agent/tools/web_search.ts` on Exa (`exa-js`): narrow, capped, results delimited as untrusted. |
| Self-hosted persistence: local world on disk by default; `experimental.workflow.world: "@workflow/world-postgres"`, pinned to eve's `5.0.0-beta` line (`agent-config.md`). The world reads `WORKFLOW_POSTGRES_URL`. | Pin `@workflow/world-postgres@5.0.0-beta.48`. Sessions, streams, hooks and sleeps are durable in Postgres. |
| The Postgres world's README says `POST /.well-known/workflow/v1/flow` is **unauthenticated** and must not be publicly reachable. | **The agents service is never public.** Only `web` is exposed. Webhooks reach the agent through allow-listed forwarders in `web`. |
| eve hooks are observe-only (no output rewriting). Text streams as `message.appended` deltas (`guides/hooks.md`). | Output-boundary filtering (never-tier redaction, prompt canary) runs in the BFF stream transform, independent of the model. |
| No built-in rate limiting. Route auth does not enforce session ownership (`guides/auth-and-route-protection.md`). | The BFF enforces signed-visitor identity, session ownership, rate limits and caps, all backed by Postgres. |
| eve tool `approval:` asks the **session's caller** (the visitor) and parks the turn. A visitor's steering message cancels it (`tools/human-in-the-loop.md`). | Owner approval is **not** tool `approval:`. It is eve's documented "approve with a deadline" pattern: a workflow **task** tool racing `createWebhook()` against `sleep("15m")` (`tools/workflows.mdx`, `tools/tasks.md`). A task does not hold the conversation, and a steering message does not withdraw it. |
| eve skills are model-loaded via `load_skill` and "cannot scope tools" (`skills.mdx`). | The skill contract (prompt + allowed tools + evals, composed per turn) is built on eve's dynamic capabilities; see §5. |
| `fileMemory()` has no self-hosted backend; custom providers come from `defineMemoryProvider` (`memory/custom-provider.md`). `byPrincipal` disables memory for anonymous callers. | Visitors authenticate as `principalType: "user"` (signed cookie → HS256 JWT → eve `jwtHmac`). Long-term memory is a Postgres memory provider. |
| `experimental.workflow.retention: 0` deletes run data when a run ends. Session `reset` retires a session (`agent-config.md`, `channels/eve.mdx`). | Retention and deletion are deterministic; see §8. |
| Cal.com: API v1 was shut down 2026-04-08. The hosted MCP (`mcp.cal.com`) is OAuth with full-account scope. The embed supports `metadata[...]` passthrough to webhooks. `X-Cal-Signature-256` is an HMAC-SHA256 of the raw body. `bookingSuccessfulV2` is the current browser event. | Cal.com is used through the **official embed + webhook**. **No Cal.com MCP connection:** the twin performs no Cal.com reads or writes, and the only read candidate (slots) duplicates free/busy. Adding one later is a single file in `agent/connections/`. |
| The Google Calendar MCP is a **Developer Preview**: user OAuth only (7-day refresh tokens while in Testing), and it exposes event titles and write tools. `freeBusy.query` with a service account shared as `freeBusyReader` is official and least-privilege. | `check_availability` calls `freeBusy.query` directly with a service account. It can never see event details or write. |
| Payload `@payloadcms/plugin-mcp@3.90.2` is installed at `/api/mcp` with per-key capabilities and **custom tools** (`mcp.tools`). Reads work; writes are broken under TS7 (irrelevant here). | The knowledge base is reached over **Payload MCP**, through one purpose-built custom MCP tool, `twinSearch`, that enforces disclosure tiers server-side, plus `twinDisclose` for approved restricted items. The agent calls it with `@ai-sdk/mcp`'s `createMCPClient` (AI SDK v7, stateless MCP 2026-07-28 compatible). |
| `useChat` is not compatible with eve's NDJSON stream; the client is `useEveAgent` from `eve/react` (`guides/frontend/overview.mdx`). | The Messenger window uses `useEveAgent({ host: "/api/twin" })`. |

## 2. Topology

```
browser ── /os Messenger (eve/react) ──► web: /api/twin/* BFF ──(internal net, JWT)──► agents: eve start (/eve/v1/*)
                                          │  cookie → JWT, ownership,                      │  OpenRouter (model)
                                          │  rate limits, caps, output filter             │  Payload MCP (twinSearch/twinDisclose)
Cal.com ── webhook ──► web /api/twin/hooks/cal ───────(raw forward)──► agents /webhooks/cal   │  Google freeBusy
Telegram ─ webhook ──► web /api/twin/hooks/telegram ──(raw forward)──► agents /webhooks/telegram
                                          └──────────── Postgres (schema twin + workflow world) ───┘
```

- **Services:** `web` (public), `cms` (public), `agents` (internal only, `expose: 3000`), and `postgres`
  (internal; named volume). Local development uses `docker-compose.dev.yml`, which contains only Postgres.
- **The BFF** (`apps/web/app/api/twin/[...path]/route.ts`) proxies only eve's session routes
  (`POST /session`, `POST /session/:id`, `GET /session/:id/stream`). Control routes (`clear`, `reset`,
  `compact`, `cancel`) are not proxied to visitors. `inputResponses` from visitors are rejected.
- **The webhook forwarders** are dumb pass-throughs. They forward the raw body and signature headers.
  Signature verification lives in the agents service, next to the secrets.

## 3. Packages and file layout

**`packages/twin`** (new, `@repo/twin`) is used by **both** `apps/agents` and `apps/web`, so the
two-consumer rule is met. It exposes these subpath exports:

- `./db`: Drizzle schema for the `twin` Postgres schema, typed queries, and the committed SQL migrations
  under `packages/twin/migrations` (generated by `drizzle-kit`, applied by a `migrate` script).
- `./contract`: zod schemas and types shared over the wire. These cover the conversation-state record,
  `schedule_call` output, throttle and ended payloads, and the signed booking reference.
- `./env`: a zod env schema per consumer (`agentsEnv`, `webTwinEnv`), parsed at startup. It fails loudly.
- `./redact`: never-tier and PII redaction, plus the stream-safe redactor with holdback. It is used by
  the BFF (stream) and the agents service (transcripts).

**`apps/agents`** (eve; the sample content is replaced):

```
agent/
  agent.ts                  model (OpenRouter + fallback), limits, defaultTools:false, postgres world, retention 0
  instructions.ts           defineDynamic turn.started → system: composed skills + state digest + data protocol
  channels/eve.ts           eveChannel: auth [jwtHmac(visitor), localDev()], turnPolicy "steer" (a turn held by an approval task must stay open to new messages), uploads disabled, onMessage (abuse gate)
  channels/webhooks.ts      defineChannel routes: POST /webhooks/cal, POST /webhooks/telegram
  tools/search_portfolio.ts plain tool → Payload MCP twinSearch (session cache, tier stubs)
  tools/check_availability.ts plain tool → Google freeBusy (read-only)
  tools/schedule_call.ts    plain tool → returns the widget descriptor (state guards only)
  tools/record_call_decline.ts plain tool → sets the decline floor
  tools/note_visitor.ts     plain tool → visitor-intake identity (typed)
  tools/request_disclosure.ts workflow task → owner approval (Telegram) racing sleep("15m")
  tools/web_search.ts       plain tool → Exa, narrow
  tools/no_reply.ts         opt-in eve tool (stay silent when a task result needs no message)
  hooks/intent.ts           message.completed → evaluate_call_intent → persist evaluation + state
  hooks/transcript.ts       message.completed → redacted transcript row
  hooks/usage.ts            instrumentation model.call.completed → spend ledger
  memory/visitor.ts         defineMemory(postgres provider, byPrincipal): returning-visitor recall
  schedules/purge.ts        daily retention purge (90 days)
  lib/                      intent/, skills/, payload-mcp.ts, google-freebusy.ts, telegram.ts, untrusted.ts, state.ts …
skills/<name>/SKILL.md      the six skills (eve SKILL.md format) + skill.ts manifest + fixtures
evals/                      evals.config.ts, skills/<name>/*.eval.ts, acceptance/*.eval.ts, fixtures/mock-agent/
```

**`apps/payload`** changes:

- **A `disclosure` select field** (`public` | `restricted` | `never`, default `public`). It goes on
  `experiences`, `projects`, `content` and `disciplines` through a shared `fields/disclosure.ts` helper.
- **Read access returns a `Where` clause.** Anonymous callers see only `public`; authenticated users see
  everything except `never`. Admins see all. The web's REST reads therefore can never return
  restricted or never-tier items.
- **A new `knowledge` collection** for facts that are not portfolio entries (notice period, rates
  policy, relocation, work authorisation, preferred stack, writing samples). Its fields: `topic`,
  `category` (`availability | compensation | logistics | background | voice | other`), `answer` (text).
  `voice` entries hold 3–5 real writing samples pasted by the owner; the `identity` skill quotes them
  and nothing is invented. Further fields:
  `disclosure`, and `redactTerms[]`, which is used only on `never` entries and read only by the
  authenticated BFF.
- **Two custom MCP tools** in `src/mcp/twin-tools.ts`, registered through the plugin's `mcp.tools`, so
  that a dedicated read-only "twin" API key can call them and nothing else:
  - `twinSearch({ query, limit })` searches the profile, experiences, projects, content, disciplines and
    knowledge across typed text fields. It returns public items in full and restricted items as stubs,
    and excludes never-tier items.
  - `twinDisclose({ sourceId })` returns one restricted item.
- **The `messenger` global** drops `contact.replies` and gains the labels listed in §9.
- **One committed migration** covers all of the above.

## 4. Mapping the requirements to eve

| Requirement | eve primitive / mechanism |
|---|---|
| Agent definition, model, budgets | `defineAgent` (`agent.ts`): `limits.maxInputTokensPerSession`, `maxOutputTokensPerSession`, `sessionTimeoutMs` |
| Per-turn prompt composition | `defineDynamic` instructions on `turn.started`, `role: "system"` |
| Tools | `defineTool` (plain), `defineWorkflowTool` with `task` (approval), dynamic tool availability per active skill |
| Knowledge base | Payload MCP custom tools via `@ai-sdk/mcp` inside `search_portfolio` (eve connections are model-facing and lack `toModelOutput`, caching and tier stubs, so a wrapping tool is required) |
| Human approval (durable, async, timeout) | Workflow task + `createWebhook` + `sleep("15m")` + `"use step"` notify (eve "approve with a deadline") |
| Webhooks (Cal.com, Telegram) | Custom channel routes, `defineChannel({ routes: [POST(...)] })`, `attachSession(id).send(...)` |
| Turn persistence and resumable streams | The eve session and its durable NDJSON stream, resumed by the client with `initialSession` + `resume: true` |
| Conversation state | `twin.conversations` row (typed by `@repo/twin/contract`), read in the resolver and written by tools, hooks and webhooks |
| Long-term memory | `defineMemory` + `defineMemoryProvider` (Postgres), `byPrincipal` |
| Intent evaluation | `hooks/intent.ts` on `message.completed`. A deterministic scorer plus an enum classifier through AI SDK `generateText` + `Output.choice` |
| Abuse classification | `eveChannel({ onMessage })` before dispatch |
| Retention purge | `defineSchedule` (runs under `eve start`) |
| Evals | `eve eval` (`defineEval`, `mockModel` fixture agent for offline runs) |
| Subagents | **None** (see §11) |

## 5. Skills

**Format.** Each skill is a self-contained folder, `apps/agents/skills/<name>/`:

- `SKILL.md`: eve's skill file format. It has frontmatter with `description` and string
  `metadata: { version }`, followed by the prompt fragment.
- `skill.ts`: a typed manifest, `defineTwinSkill({ name, version, tools: [...], activeWhen(state) })`.
  `activeWhen` is a pure predicate over conversation state.
- Eval cases live at `apps/agents/evals/skills/<name>/*.eval.ts`, because eve requires evals under `evals/`.

**Composition** (`agent/lib/skills/compose.ts`). On every turn:

1. `instructions.ts` loads conversation state.
2. It selects the skills whose `activeWhen(state)` is true.
3. It concatenates their bodies in a fixed order, each wrapped in `<skill name version>`.

That makes the prompt deterministic, testable and diffable. There is no monolithic prompt and no
duplicated text.

**Tool scoping.** Each tool module is a `defineDynamic` resolver on `step.started`. A tool is offered
only if an active skill lists it. `load_skill` is not used: eve's lazy loading is model-driven, and a
model that skipped loading `boundaries` would be a security failure.

| Skill | Active | Tools | Owns |
|---|---|---|---|
| `identity` | always | – | First person; voice; grounding from the Payload profile; 3–5 real writing samples taken from the owner's published posts; the honest "real person?" carve-out (§9) |
| `answer-depth` | always | – | The calibration rules in §9 |
| `portfolio-recall` | always | `search_portfolio`, `request_disclosure` | Search before any factual claim; cite by source id; when empty, say "I don't have that to hand" and offer a call; restricted stubs lead to `request_disclosure` |
| `boundaries` | always | – | Never-disclose list, deflection style, injection resistance, the untrusted-data protocol |
| `visitor-intake` | always | `note_visitor`, `web_search` | Read who the visitor is from what they volunteer and pitch the level; `web_search` only for public context about the visitor's company or role |
| `scheduling` | always | `check_availability`, `schedule_call`, `record_call_decline` | Warm-offer phrasing, decline handling, timezones. It has **no** trigger logic: the state digest says which tier applies |

## 6. Tools

All tools share these rules:

- zod `inputSchema` and `outputSchema`.
- Outputs that carry external content go through `toModelOutput`, which wraps them in an untrusted block (§10).
- Every call is recorded in `conversation.toolsUsed`.

- **`search_portfolio({ query })`**
  - Normalises the query (NFKC, lowercase, collapsed whitespace, sorted unique terms) and checks
    `twin.search_cache` (session id + normalised query).
  - On a miss, it calls the Payload MCP tool `twinSearch`, then stores the result.
  - Results contain `public` items in full (with `sourceId` = `collection:id`) and `restricted` items as
    stubs (`{ sourceId, topic }`). `never`-tier items are excluded inside Payload and never cross the wire.
  - The returned source ids are appended to `conversation.citedSources`.
- **`check_availability({ from, to })`**
  - Runs `freeBusy.query` on `GOOGLE_CALENDAR_ID` within a window capped at 14 days.
  - Returns busy intervals reduced to per-day "mostly open / partly / busy" summaries in both timezones
    (visitor tz from client context, owner tz from env).
  - It cannot create or modify events.
- **`schedule_call({ trigger: "explicit_request" | "hot_tier" })`**
  - Guards:
    - Refuses if `widgetShown`.
    - Refuses `hot_tier` unless `state.tier === "hot"`.
    - A refusal returns a reason the model can act on.
  - On success it returns a `ScheduleCall` descriptor:
    - `{ calLink, bookingRef, ownerTimeZone, visitorTimeZone, prefill }`
    - `bookingRef` is the signed opaque reference passed as `metadata[bookingRef]` to the embed.
  - Sets `widgetShown`. The client renders the dialog from the typed tool part.
- **`record_call_decline()`**
  - Sets `callOfferDeclined` and records the outcome `declined` on the latest evaluation.
- **`note_visitor({ name?, company?, role?, kind, technical })`**
  - `kind` is one of `recruiter | hiring_manager | client | engineer | other`.
  - Writes `conversation.visitor` and links the long-term visitor record.
- **`request_disclosure({ sourceId, reason })`**
  > Transport superseded on 2026-10-05: owner approvals use iMessage via Sendblue. See [2026-10-05-imessage-owner-approvals-design.md](2026-10-05-imessage-owner-approvals-design.md).
  - A workflow `task`:
    1. A step persists a pending approval and sets `pendingApproval` in state.
    2. `createWebhook()` creates the callback URL.
    3. A step sends a Telegram message to the owner with Approve and Deny buttons. The button's
       `callback_data` is the approval id.
    4. The body races the webhook against `sleep("15m")`.
  - **Owner decides:** the Telegram webhook route verifies `X-Telegram-Bot-Api-Secret-Token` and the
    owner's user id, records `{ actor, decidedAt, reasoning }`, and POSTs the decision to the stored
    webhook URL (loopback). It then answers `answerCallbackQuery` and edits the message.
  - **No decision in 15 minutes:** the approval becomes `expired` (auto-deny, logged).
  - **Result:**
    - If approved, a step fetches the restricted item through `twinDisclose`.
    - `toModelOutput` returns either the item as untrusted data or a "not available — continue
      without it, never mention a pending check" note.
  - The task's receipt tells the model to carry on and say nothing about checking.
  - The result arrives at the next step boundary. The model may answer it naturally or call
    `no_reply`.
- **`web_search({ query })`**
  - Exa, at most 5 results, snippets truncated, results delimited as untrusted.
  - The `visitor-intake` skill limits use to public context about the visitor's company or role.

## 7. Intent evaluation (`evaluate_call_intent`)

**Placement.** eve streams text deltas as they are produced. There is no "drafted but not yet streamed"
window, short of buffering the whole reply, which would defeat time-to-first-token. Evaluation
therefore runs in `hooks/intent.ts` after each assistant `message.completed`, off the critical path.
Its result drives the **next** turn through the state digest. The consequences:

- **Time-to-first-token is untouched.**
- **An explicit request skips scoring.** The model calls `schedule_call({ trigger: "explicit_request" })`
  in the same turn, and the evaluation records `requesting_call → hot` with reason `explicit request`.
- **The idempotency key is `(sessionId, assistantMessageId)`.** At-least-once hook delivery is
  deduplicated by a unique index.
- **Budget:** the brief's 200 ms limit protected a *blocking* evaluation. This design never blocks, so
  the classifier gets `classifierTimeoutMs` (4,000 ms, in the config). On timeout, the evaluation is
  persisted with `outcome: "classifier_timeout"` and scored from deterministic signals only, and the next
  message re-evaluates.
- **Idempotency key, concretely:** `(sessionId, turnId, sequence)` from the `message.completed` event,
  restricted to `finishReason !== "tool-calls"`.

**Scoring** (`agent/lib/intent/`, pure):

- **`classify.ts`:** AI SDK `generateText` with `Output.choice` over the stable enum
  `requesting_call | hiring_signal | evaluating | browsing | unrelated`. It reads the last 6 messages and
  runs on `TWIN_CLASSIFIER_MODEL` (cheap model, OpenRouter).
- **`signals.ts`:** deterministic, from state only:
  - turn count
  - distinct topics cited
  - `check_availability` used (an availability question)
  - compensation or notice-period stub requested (restricted topic category)
  - a specific project or role cited
  - visitor self-identified
  - returning visitor
- **`weights.ts`:** the single typed config `IntentWeights`, with a rationale comment on every weight
  and the tier thresholds.
- **`score.ts`:**
  - Formula: `score = Σ weights(signals) + weights.intent[class]`.
  - Tiers: `cold < warmAt ≤ warm < hotAt ≤ hot`.
  - Floors:
    - `requesting_call` forces hot.
    - `callOfferDeclined` caps the score at `warmAt - 1` for the session.
    - Once `widgetShown`, the tier stays where it is.
  - Output: `{ score, tier, reasons: string[] }`, with `reasons.length >= 1` enforced by zod **and** a
    DB check constraint.

**Actions** (through the digest, read by the `scheduling` skill):

- **`cold`:** nothing.
- **`warm`:** one natural call offer, once (`callOfferMade`).
- **`hot`:** render the widget.

Every evaluation is persisted in `twin.intent_evaluations`, with an `outcome` that is updated later:

- `none`
- `offered`
- `widget_rendered`
- `declined`
- `booked`
- `classifier_timeout`

## 8. State

### Turn

eve owns message persistence and resumable streams in the Postgres world. The client stores
`{ sessionId, streamIndex }` and resumes. `hooks/transcript.ts` writes a **redacted** transcript row per
message.

### Conversation

There is one record, `twin.conversations` (`session_id` PK, `visitor_id` FK). The typed `state jsonb` is
validated by `ConversationState` in `@repo/twin/contract`. Its fields:

- `visitor` (name, company, role, kind, technical)
- `topicsCited` and `citedSources`
- `intent` (score, tier, history ids)
- `toolsUsed`
- `widgetShown`, `callOfferMade`, `callOfferDeclined`
- `booking` (status, start, uid)
- `pendingApproval` and the approval decisions
- `violations`
- `turnCount`
- `ended`

This record is the **only** thing that drives behaviour between turns. Its writers:

- tools (in-session)
- `hooks/intent.ts`
- the Cal.com and Telegram routes
- `onMessage` (violations)

**Why not eve's `defineState`:** webhooks and the BFF cannot write it, and it cannot be queried for
tuning or analytics. Keeping both would duplicate the source of truth.

**Write discipline:** updates are row-locked (`SELECT … FOR UPDATE`) read-modify-write, validated before
the write.

The resolver injects a compact **state digest** (≤ 600 chars), not raw history.

### Long-term

- **Visitor auth:** eve's `jwtHmac` always yields `principalType: "service"`. `channels/eve.ts` therefore
  wraps `verifyJwtHmac` and maps the result to `principalType: "user"`. For every proxied request, the BFF
  mints a 60-second HS256 JWT with `sub = visitorId` and a validated `tz` claim (the browser's IANA zone).
  Tools read it from `ctx.session.auth.current.attributes.tz`. The browser never sees the JWT.
- **Visitor identity:** `twin.visitors` keyed by a random visitor id held in an HMAC-signed, httpOnly,
  `SameSite=Lax`, 90-day cookie (`twin_vid`).
- **Stable identifier:** an optional `stable_key_hash` (HMAC-SHA256 of a volunteered email) links devices.
  The email itself is never stored.
- **Returning-visitor recall:** the memory provider recalls a summary of prior visits: identity, topics,
  booking, decline.

**Retention: 90 days.**

- `schedules/purge.ts` runs daily at 03:00 UTC. It deletes visitors (cascading to conversations,
  evaluations, approvals, bookings, transcripts and cache) whose `last_seen_at` is more than 90 days ago,
  plus orphaned rate-limit rows.
- eve run data uses `retention: 0` with `limits.sessionTimeoutMs = 30 days`, so raw run data never
  outlives 30 days.

**Deletion endpoint:** `DELETE /api/twin/me` (cookie-authenticated).

1. It calls `reset` on each of the visitor's eve sessions, which ends the run and, with retention 0,
   deletes its run data.
2. It deletes the visitor's rows.
3. It clears the cookie.

### Tables (`twin` schema)

- `visitors`
- `conversations`
- `intent_evaluations`
- `approvals`
- `bookings`
- `transcripts`
- `search_cache`
- `rate_limits` (fixed-window counters, atomic upsert)
- `spend_ledger` (per model call, cost reported by OpenRouter)

### Booking acknowledgement

The Cal.com route verifies `X-Cal-Signature-256`, verifies the signed `metadata.bookingRef` → session id, upserts `twin.bookings`, updates `conversation.booking`, then `attachSession(sessionId).send(encodeNotice({ kind: "booking.confirmed", startTime }), { auth: <service principal "cal-webhook">, turnPolicy: "queue" })`. The notice is a typed JSON envelope (`TwinNotice` in `@repo/twin/contract`); the Messenger window renders it as an MSN system line instead of a visitor bubble, and the turn's dynamic instructions (driven by the DB booking status, not the message text) make the agent acknowledge in character. A spoofed notice typed by a visitor changes nothing: behaviour reads state, not text.

## 9. Persona and response depth

- **First person, always.** Name and role come from the Payload `profile` global and current experience,
  and the city from `profile.location`. They are injected at `session.started` as grounded public data,
  never hard-coded.
- **Depth rules** (`answer-depth`):
  - Small talk: 1–2 sentences.
  - Simple factual: 2–4 sentences, no preamble.
  - Deep technical: decisions and trade-offs from the case study, structured.
  - Vague: a short answer plus one narrowing question.
  - No restating the question, no padding.
- **Banned register:** "I'd be happy to help", "Great question", "As an AI", "Let me know if you need
  anything else", and unprompted bullet dumps. This is asserted in evals.
- **Carve-out:** a sincere, direct "am I talking to a real person?" gets an honest answer in the owner's
  voice ("this is an AI version of me…") plus `schedule_call({ trigger: "explicit_request" })`.
- **The Messenger UI keeps its CMS-sourced look.** The scripted `contact.replies` field is removed. New
  `messenger.labels` fields: `throttled`, `ended`, `offline`, `privacy`, `bookingTitle`, `yourTime`,
  `myTime`.

## 10. Guardrails

**Untrusted data, enforced structurally** (`agent/lib/untrusted.ts`):

- Every tool output that carries external or CMS text is serialised as
  `<untrusted source="…" nonce="…">…</untrusted>`.
- The nonce is per turn. Any `</untrusted` inside the content is escaped.
- The `boundaries` skill declares the protocol.
- Visitor input stays in the user role; it is never concatenated into system text.

**Prompt secrecy:**

- The system prompt carries a per-deployment canary token (`TWIN_PROMPT_CANARY`).
- The BFF output filter replaces any message containing the canary, or banned leakage markers, with an
  in-character deflection.
- 20 scripted jailbreak evals must produce zero leakage.

**Never tier:**

- Payload excludes `never` items in `twinSearch`/`twinDisclose` and in public REST.
- Independently, the BFF redacts at the output boundary. It uses `redactTerms` that the CMS holds on
  `never` knowledge entries (served by a Payload custom endpoint, `GET /api/twin/redact-terms`, guarded by
  `TWIN_REDACT_SECRET` and compared in constant time), plus email and phone patterns
  minus public contact allow-listed values.
- The redactor streams with a holdback of K characters, where K is the longest term (min 64) and the
  remainder flushes on `message.completed`.
- Transcripts reuse the same redactor.

**Rate limits and caps** (BFF, Postgres; values in `@repo/twin/contract` config):

| Limit | Value |
|---|---|
| Per IP | 12/min, 300/day |
| Per session | 8/min, 120/day |
| Message length | 1,000 characters |
| Turns per conversation | 40 |
| Tokens per session | eve `limits` |
| Spend per day | `TWIN_DAILY_SPEND_USD` (spend ledger) |

- **Throttling** returns 429 with `{ kind: "throttled" }`, and the window shows the CMS `throttled`
  line in character.
- **A token-limit continuation prompt** (`kind: "session-limit"`) is never offered to visitors. The BFF
  ends the conversation with the `ended` label.

**Abuse:**

- `onMessage` classifies input with the cheap model, into an enum: `ok | harassment | sexual | hate |
  prompt_attack | spam`.
- If the input is not `ok`, the violation is recorded and the context instructs one brief in-character
  deflection.
- After 3 violations, `ended = true`, and the BFF refuses further sends for that session.

**Secrets and transcripts:**

- All secrets are server-side. CI builds `apps/web` and greps `.next/static` for every secret env name,
  the canary, and skill-file sentinels; it fails on a match.
- Transcripts are stored redacted. The privacy notice sits in the Conversation footer and links to the
  deletion endpoint.

## 11. Trade-offs considered and rejected

- **Subagents** (e.g. a scheduling agent): rejected.
  - Subagents inherit nothing and do not share state.
  - Every call is a task, which adds latency.
  - One persona with six skills and eight tools fits one agent.
  - Revisit only if a capability needs an isolated toolset or model.
- **eve tool `approval:`** for owner approval: rejected. It asks the visitor and blocks the turn (§1).
- **An `execute` workflow tool** for approval: rejected. It holds the conversation and is cancelled by
  steering.
- **`defineState` as conversation state:** rejected (§8).
- **Evaluating intent before streaming:** rejected (§7, time-to-first-token).
- **A Cal.com MCP connection:** rejected (§1). There is no read the twin needs, and it is full-account
  OAuth.
- **The Google Calendar MCP:** rejected. It is a Developer Preview, requires user OAuth, and exposes
  event details.
- **A vector DB / RAG:** rejected. The corpus is a few dozen structured CMS documents, and `twinSearch`
  over typed fields is exact and citable.
- **`withEve` same-origin mount:** rejected. A BFF is required for ownership, rate limits and output
  filtering, and the agent must stay off the public network.
- **Exposing the agents service publicly for webhooks:** rejected. The world's flow route is
  unauthenticated.
- **`@calcom/embed-react`:** rejected. It has not been published since 2025-04. The official vanilla
  `embed.js` snippet (`Cal("inline")`, namespaced) is used in a small React component.
- **pglite in the eve runtime:** rejected (the template notes bundling breakage). pglite is used **only**
  in vitest for zero-network DB tests.

## 12. Model configuration

- **Primary:** `anthropic/claude-sonnet-5.5`, chosen for persona fidelity and injection resistance.
- **Fallback:** `deepseek/deepseek-v4.1-flash`, through OpenRouter `models`.
- **Classifier (intent and abuse):** `deepseek/deepseek-v4.1-flash`.
- All are env-configurable (`TWIN_MODEL`, `TWIN_MODEL_FALLBACKS`, `TWIN_CLASSIFIER_MODEL`).
- `provider: { data_collection: "deny" }`.
- The OpenRouter key also carries a spend limit, as documented in the README operations section.

## 13. Testing and acceptance

- **Unit tests (vitest, zero network)** in `apps/agents` and `packages/twin`:
  - scorer, signals, weights invariants
  - skill composer and tool scoping
  - untrusted wrapping
  - redactor (including chunk-boundary holdback)
  - booking-ref signing, Cal.com and Telegram signature verification
  - rate-limit windows
  - DB queries on pglite with the committed migrations
- **Offline evals:** `eve eval` against a fixture agent with `mockModel` (scripted model) cover the
  runtime plumbing:
  - the widget guards
  - decline floor and no repeat
  - approval timeout path (sleep shortened by config in the fixture)
  - "are you available?" → booked in ≤ 4 turns, with the booking simulated through the webhook route
  - reasons non-empty
- **Live evals** (OpenRouter, CI on `main` and `workflow_dispatch`):
  - 20 jailbreaks, zero leakage
  - 20 cold browsing sessions, no widget
  - persona and depth checks
  - grounding: every factual claim traceable to a `search_portfolio` source id. Asserted by checking
    that every reply with a claim had a `search_portfolio` call in the turn, plus a judge check against
    the cited sources.
- **Time-to-first-token:** an eval asserts that the intent hook runs after `message.completed`; the
  ordering is structural.
- **Web:** unit tests for the BFF (ownership, limits, filter transform) and the Messenger hook; an e2e
  test with the agent mocked at the BFF.
- **CI:** `.github/workflows/ci.yml` (new) runs install, check-types, unit tests, Payload migration
  check, `eve build`, offline evals, the bundle secret scan, and live evals when the secret is present.

## 14. Deliverables

- this spec
- the plan (`docs/superpowers/plans/2026-10-04-portfolio-twin-agent.md`)
- the implementation
- six skill folders
- migrations: `packages/twin/migrations` and a Payload migration for disclosure tiers, `knowledge`, and
  messenger labels
- the env manifest: `apps/agents/.env.example`, `apps/web/.env.example`, and the table in the README
- `apps/agents/README.md`: architecture, operations, **how to add an MCP connection** (one file in
  `agent/connections/` + allowlist + a skill granting it), **how to add a skill** (folder + manifest +
  evals)
- `docker-compose.yml` and `.dev.yml` updates
- an Easypanel docs update
