# Twin Model Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route each twin turn to Haiku (light), Sonnet (standard) or Opus (deep), using a depth label from the existing pre-turn classifier and eve's dynamic model on `step.started`. Model ids must stay out of the browser.

**Architecture:**
- One classifier call returns `{ verdict, depth }`.
- The eve channel stores the turn's tier in `ConversationState.modelTier`.
- `agent.ts` uses `defineDynamic({ events: { 'step.started' } })` to return the tier's OpenRouter model with its context window and reasoning.
- The web BFF filter blanks `modelId` on `step.started`.

**Tech Stack:** eve 0.71, AI SDK 7 (`generateText` + `Output.object`), `@openrouter/ai-sdk-provider` 3.1.0, zod 4.5.4, vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-05-twin-model-routing-design.md`. Read it first.

## Global conventions

- **Style:** single quotes, no semicolons, 2-space indent. Every export gets a one-line JSDoc. Comments explain why. No `any`; no placeholders or TODOs.
- **Line endings:** keep each file's existing ones (several use CRLF).
- **Running commands:** from the repo root `D:\Second Brain\01.PROJETOS\applications\my-portfolio`, with the Bash tool (Git Bash).
- **Commits:**
  - conventional, with a scope;
  - trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - stage only the files you changed for the task;
  - never stage `apps/payload/src/app/(payload)/admin/importMap.js` or the root `package.json`.
- **Env:** read only through `getEnv()` (lazy), never at module top level. eve evaluates modules at build time without secrets. `agent/lib/models.ts` is the existing build-time-safe exception (`modelIds(process.env)` with `blankToUndefined`).
- **eve docs:** they live at `node_modules/.bun/eve@0.71.0+5cc7bce1b2bea836/node_modules/eve/docs/`. Read `agent-config.md` ("Choose the model dynamically", "Compaction") before Task 3.
- **Safety:** never print secrets. Never touch `apps/payload/payload.db`.

---

### Task 1: tiers in the contract, env and models

**Files:**
- `packages/twin/src/contract/state.ts`: export `ModelTier = z.enum(['light', 'standard', 'deep'])` and its type. Add `modelTier: ModelTier.default('standard')` to `ConversationState`, after `ended`, with the comment `// The tier the current turn runs on; written by the channel before the turn starts.`. Export it from the contract index if the index lists exports explicitly.
- `packages/twin/src/env.ts`:
  1. Extend `MODEL_DEFAULTS` with:
     ```ts
     light: 'anthropic/claude-haiku-4.5',
     lightContextTokens: 200_000,
     deep: 'anthropic/claude-opus-5.5',
     deepContextTokens: 1_000_000,
     ```
  2. Add to `agentsEnvObject`, next to the existing model vars:
     ```ts
     TWIN_MODEL_LIGHT: z.string().min(1).default(MODEL_DEFAULTS.light),
     TWIN_MODEL_LIGHT_CONTEXT_TOKENS: z.coerce.number().int().positive().default(MODEL_DEFAULTS.lightContextTokens),
     TWIN_MODEL_DEEP: z.string().min(1).default(MODEL_DEFAULTS.deep),
     TWIN_MODEL_DEEP_CONTEXT_TOKENS: z.coerce.number().int().positive().default(MODEL_DEFAULTS.deepContextTokens),
     ```
- `apps/agents/agent/lib/models.ts`:
  1. Keep `modelIds` (used by `agent.ts` and tests) but extend it. Add a `tiers` property: `Record<ModelTier, { id: string; chain: string[]; contextTokens: number; reasoning: 'low' | 'medium' }>`.
  2. **Chains:** deep is `[deep, standard, ...fallbacks]`, standard is `[standard, ...fallbacks]`, light is `[light, ...fallbacks]`. Each is de-duplicated, and blank env vars count as absent (as today).
  3. **Reasoning:** light `low`, standard `low`, deep `medium`.
  4. Add `export function tierModel(tier: ModelTier)`. It returns `openrouter.chat(id, { models: chain, provider: { data_collection: 'deny' }, usage: { include: true } })` for that tier. Then `twinModel()` becomes `tierModel('standard')` (keep it exported).
- **Tests:**
  - `packages/twin/tests/env.test.ts`: the defaults and an override for the new vars.
  - `packages/twin/tests/contract/*`: a fresh state has `modelTier: 'standard'`, and an old stored state without the field parses to `standard`.
  - `apps/agents/tests/models.test.ts`: tier ids, chains (deep includes standard, all de-duplicated, env overrides honoured, blank as absent), context tokens and reasoning.

**Steps:**
1. Write the tests first and see them fail.
2. Implement.
3. Run `bun run --cwd packages/twin test && bun run --cwd packages/twin check-types && bun run --cwd apps/agents test && bun run --cwd apps/agents check-types`. All must be green.
4. Commit: `feat(twin): model tiers (light, standard, deep) in the state, env and OpenRouter chains`.

---

### Task 2: the gate classifies depth, and the channel stores the tier

**Files:** `apps/agents/agent/lib/abuse.ts`, `apps/agents/agent/channels/eve.ts`, `apps/agents/tests/abuse.test.ts`, `apps/agents/tests/eve-channel.test.ts`.

**Changes in `abuse.ts`:**
1. Add:
   ```ts
   /** One gate decision per visitor message: abuse or scope verdict, and how deep the answer must go. */
   export const GateDecision = z.object({ verdict: AbuseVerdict, depth: ModelTier })
   export type GateDecision = z.infer<typeof GateDecision>
   ```
2. Replace `classifyAbuse(text, timeoutMs)` with `classifyMessage(text: string, previous: ReadonlyArray<{ role: 'visitor' | 'twin'; text: string }>, timeoutMs: number): Promise<GateDecision>`.
   - Use `Output.object({ schema: GateDecision })`.
   - Prompt shape: a `Previous exchange (context for depth only):` section listing each previous turn as `visitor: …` / `twin: …`, each truncated to 600 characters, then `Message to classify:` with the text (2,000 characters max, as today). Omit the previous-exchange section when `previous` is empty.
   - Same `maxRetries: 0`, abort and logging behaviour.
   - Fallback: `{ verdict: 'ok', depth: 'standard' }`.
3. Extend `SYSTEM` with a depth section, and state that `verdict` is judged on the message to classify alone:
   ```
   depth (how much expertise the reply needs; use the previous exchange only to judge follow-ups):
   light: greetings, small talk, thanks, logistics and scheduling, short factual questions about the owner, and anything that is not ok.
   standard: explaining the owner's work, projects, experience, skills or opinions.
   deep: in-depth technical questions: architecture, system design, trade-offs, debugging reasoning, or comparisons that need real expertise, including short follow-ups inside such a thread.
   ```
4. Keep `countsAsViolation`, `offScopeContext`, `closingContext` and `deflectionContext` unchanged.

**Changes in `eve.ts`:**
1. Get the previous exchange with `recentTurns(sessionId, 2)` from `../lib/transcript`.
   - Wrap it in a try/catch that falls back to `[]` on error, because `onMessage` must never throw.
   - Call `classifyMessage(textOf(message), previous, getEnv().TWIN_ABUSE_TIMEOUT_MS)`.
2. Compute the tier: `verdict !== 'ok'` gives `'light'`, otherwise `depth`.
3. Write `modelTier` in the same `updateConversation` that already runs for violations. For `ok` and `off_scope`, which don't touch violations today, do a small `updateConversation(db(), sessionId, (s) => ({ ...s, modelTier: tier }))`.
4. For an ended conversation (the `closingContext` branch), set `modelTier: 'light'` before returning. Keep the returned shapes exactly as today: `{ auth }`, `{ auth, context: [...] }`.

**Tests:**
- `abuse.test.ts`: the object output is parsed; the previous exchange appears in the prompt, truncated; it is omitted when empty; a timeout gives `{ ok, standard }`; a failure gives the same and logs.
- `eve-channel.test.ts`, adapting the existing mocks (they mock `classifyAbuse`, so switch them to `classifyMessage`; mock `../lib/transcript` too). Cases:
  - `ok/deep` stores `deep`;
  - `ok/light` stores `light`;
  - `off_scope/deep` stores `light`, with the off-scope note and no violation;
  - `harassment` stores `light`, with the violation counted;
  - an ended conversation stores `light`;
  - a `recentTurns` failure still classifies with `[]`.

**Steps:** write the tests first, implement, run the agents suite and check-types, then commit: `feat(agents): the pre-turn gate also labels depth, and the channel stores the turn's model tier`.

---

### Task 3: the dynamic model on `step.started`

**Files:** create `apps/agents/agent/lib/model-router.ts` and `apps/agents/tests/model-router.test.ts`; modify `apps/agents/agent/agent.ts`.

**`model-router.ts`:**
```ts
import { getConversation } from '@repo/twin/db'
import type { ModelTier } from '@repo/twin/contract'
import { db } from './db'
import { modelIds, tierModel } from './models'

/** The tier the session's current turn runs on; `standard` when it can't be read. */
export async function currentTier(sessionId: string): Promise<ModelTier> {
  try {
    return (await getConversation(db(), sessionId))?.state.modelTier ?? 'standard'
  } catch (e) {
    console.error('[twin] model tier read failed; using standard', e instanceof Error ? e.message : e)
    return 'standard'
  }
}

/** eve's model selection for a tier: the OpenRouter chain, its context window and reasoning. */
export function tierSelection(tier: ModelTier) {
  const t = modelIds(process.env).tiers[tier]
  return { model: tierModel(tier), modelContextWindowTokens: t.contextTokens, reasoning: t.reasoning }
}
```
Match the real return type to eve's `PublicAgentModelSelectionDefinition` (in `eve/dist/src/shared/agent-definition.d.ts`). Import the type if it's exported publicly; otherwise let inference check it at the `agent.ts` call site.

**`agent.ts`:**
```ts
model: defineDynamic({
  events: {
    // The channel writes the turn's tier before the turn starts, so every step of a turn agrees.
    'step.started': async (_event, ctx) => tierSelection(await currentTier(ctx.session.id)),
  },
}),
```
- Import `defineDynamic` from `eve`, as `agent-config.md` shows.
- Remove the top-level `modelContextWindowTokens`. Dynamic agents can't set it.
- Keep `reasoning: 'low'` at the top level if eve allows it with a dynamic model. The selection overrides it per tier.
- **Compaction:** read `agent-config.md` "Compaction". If `compaction` accepts a `model`, set it to the standard tier's model, with its window if a window field exists. If not, leave it, and note the behaviour in the report.
- Update the JSDoc comment.

**Tests (`model-router.test.ts`):**
- `currentTier` returns the stored tier, gives `standard` for a missing row, and gives `standard` when the read throws (mock `@repo/twin/db` and `./db`).
- `tierSelection` returns the context tokens and reasoning per tier.

Mock `@openrouter/ai-sdk-provider`, or assert on everything except the model object.

**Verify:**
1. The agents suite and check-types pass.
2. `bun run --cwd apps/agents info` reports 0 errors and 0 warnings.
3. `bun run --cwd apps/agents build` succeeds.
4. The offline evals: Postgres must be up (`bun run infra:status`). Run `cd apps/agents/fixtures/offline && bun run eval`; it must still show 4 of 4 passing. The fixture has its own `agent/agent.ts` with a mock model; check that it still compiles and passes, and adapt it only if the channel change needs it.

Commit: `feat(agents): dynamic model per turn: light (Haiku), standard (Sonnet) or deep (Opus)`.

---

### Task 4: model ids never reach the browser

**Files:** `apps/web/lib/twin/filter.ts`, and its test under `apps/web/tests/unit/twin/`. Find the existing filter test file.

**Changes:**
- In `filterContent`, `case 'step.started'`: keep `started.add(keyOf(d))`. If the data has a `modelId` (or a `model`) field, return `rewrite(e, { ...d, modelId: undefined })` (plus `model: undefined` when present). Otherwise return `e`.
- Add a sentence to the filter's header comment explaining why: the boundaries forbid revealing models or providers, and routing would reveal the tier.

**Tests:** `modelId` is blanked on `step.started`; the step is still tracked, so later text deltas of that step still stream; other events are unchanged.

Run `bun run --cwd apps/web test && bun run --cwd apps/web check-types`, then commit: `fix(web): the twin stream no longer exposes model ids to visitors`.

---

### Task 5: env manifests, docs and a live routing eval

**Files:**
- `apps/agents/.env.example`, `docker-compose.yml` (`agents` service, as `${VAR:-}`), `.env.deploy.example`: the four new vars, each with a one-line comment.
- `apps/agents/README.md`:
  - the env table rows;
  - a short "Model routing" subsection under "Model and classifiers": the tiers table, how the tier is chosen, the fallbacks, why not `auto()` (3 bullets from the spec), and that model ids are stripped from the stream.
- `apps/agents/evals/skills/routing/routing.eval.ts` (tags `live`, `routing`), with three cases:
  - "Oi, tudo bem?" expects light;
  - "Me conta do seu trabalho no Autodoc" expects standard;
  - "Como você desenharia o pipeline de evals pra um agente RAG com release gates?" expects deep.

  Read `node_modules/.bun/eve@0.71.0+5cc7bce1b2bea836/node_modules/eve/docs/evals/` to find how a turn's events or `step.started` `modelId` are exposed (for example `turn.events`). Assert that the `modelId` matches the expected tier's default model id: import `MODEL_DEFAULTS` from `@repo/twin/env`. If the eval API doesn't expose `step.started` data, assert only that the turn completes, and say so in the report. Don't invent an API.

Run check-types and the agents suite, then commit: `docs(agents): model routing env, README section and a live routing eval`.
