# Twin model routing by question depth

**Status:** approved by the owner on 2026-10-05.
**Amends:** [the twin spec](2026-10-04-portfolio-twin-agent-design.md) §10 (models and classifiers).

## Goal

Answer each turn with the cheapest model that does it well:
- Haiku for light turns: greetings, small talk, logistics, simple facts and deflections;
- Sonnet for normal explanations;
- Opus for deep technical questions.

## Why not eve's `auto()` ([Automatic Model Selection](https://eve.dev/docs/guides/evaluate))

- **The context window can't be set.** `auto` options accept only `{ model, description, reasoning }` (checked in `eve/dist/src/models/auto.d.ts`), and a dynamic agent can't set a top-level `modelContextWindowTokens`. eve then resolves the window from the Vercel AI Gateway catalog. OpenRouter models aren't in that catalog, so every routed turn would fail with "AI Gateway did not provide context window metadata". That is the same failure the bundled self-modification subagent had.
- **It assumes Vercel AI Gateway.** The default evaluator (TypeSafe Jev) uses Gateway credentials. Adopting it means moving the provider from OpenRouter to Gateway and taking on a paid evaluator. The API is also marked experimental and can change in patch releases.
- **It adds a call per turn.** The twin already runs a cheap classifier before every turn (abuse and scope).

## Design

### Tiers

| Tier | Default model (OpenRouter) | Window | Price in/out per M | Used for |
|---|---|---|---|---|
| `light` | `anthropic/claude-haiku-4.5` | 200k | $1 / $5 | greetings, small talk, thanks, logistics and scheduling, simple facts about me; every off-scope or abusive message |
| `standard` | `anthropic/claude-sonnet-5.5` (today's model) | 1M | $2 / $10 | explaining my work, projects, experience and opinions |
| `deep` | `anthropic/claude-opus-5.5` | 1M | $4 / $20 | in-depth technical questions: architecture, system design, trade-offs, debugging reasoning, comparisons that need expertise |

**Env:**
- `TWIN_MODEL_LIGHT` and `TWIN_MODEL_LIGHT_CONTEXT_TOKENS`, defaulting to the values above;
- `TWIN_MODEL` and `TWIN_MODEL_CONTEXT_TOKENS`, unchanged, now the standard tier;
- `TWIN_MODEL_DEEP` and `TWIN_MODEL_DEEP_CONTEXT_TOKENS`;
- `TWIN_MODEL_FALLBACKS` stays the shared tail.

**Fallback chains.** Each tier falls back through the tiers below it, then the shared tail, de-duplicated, as OpenRouter `models` routing:
- deep: `[opus, sonnet, …fallbacks]`
- standard: `[sonnet, …fallbacks]`
- light: `[haiku, …fallbacks]`

**Reasoning:** light `low`, standard `low`, deep `medium`.

### Choosing the tier (`agent/lib/abuse.ts` → message gate)

The pre-turn classifier call returns an object `{ verdict, depth }` instead of a single choice: same model, same timeout, one call.
- **`verdict` is unchanged:** `ok`, `off_scope`, `harassment`, `sexual`, `hate`, `prompt_attack`, `spam`.
- **`depth`** is `light`, `standard` or `deep`, with the criteria from the table.
- **Context:** the classifier sees the previous exchange (the last visitor message and twin reply, from `recentTurns(sessionId, 2)`, each truncated to 600 characters). This is for depth only, so a short follow-up in a deep thread stays deep. Its prompt says to judge `verdict` on the new message alone.
- **Failure handling:** a timeout or failure yields `{ verdict: 'ok', depth: 'standard' }`, which is today's behaviour and model.

The channel (`agent/channels/eve.ts`) stores the turn's tier in conversation state, in a new field `modelTier` (default `standard`):
- `light` whenever the verdict isn't `ok` (deflections need no big model);
- `light` for an ended conversation's closing turn;
- otherwise the classifier's depth.

### Applying the tier (`agent/agent.ts`)

- **`model` is `defineDynamic`** with a `step.started` handler. It reads `modelTier` from the session's conversation row and returns `{ model, modelContextWindowTokens, reasoning }` for that tier. `step.started` is the only scope that can return live `LanguageModel` objects, which the OpenRouter instances are.
- **Latest message wins:** the tier is written when a message arrives, before its turn starts. With `turnPolicy: 'steer'`, a message sent mid-turn rewrites it and the model follows from the next step on, so a turn's steps are not guaranteed to share one model. That is acceptable: the newest message describes what the visitor wants now.
- **Out-of-order classifications:** `modelTierAt` (ISO time the message began classifying) is stored beside `modelTier`. The channel writes a tier only if its start time is no earlier than the stored one, inside the `updateConversation` updater (under the row lock), so a slower, older classification never overwrites a newer one. Violations are still counted either way.
- **The resolver never throws:** a missing row or a failed read gives `standard`. A throwing resolver would fail the turn.
- **Top-level `modelContextWindowTokens` is removed.** Dynamic agents can't set it, and each selection carries its own.
- **Compaction keeps a fixed model** (the standard tier) if eve's config allows it. Otherwise it follows the current selection. Verify against `agent-config.md` "Compaction".

### Keep model ids out of the browser (`apps/web/lib/twin/filter.ts`)

eve's `step.started` events carry `modelId`, and the BFF forwards them unchanged today, so every visitor can already see `anthropic/claude-sonnet-5.5` in the stream. The boundaries forbid revealing models or providers, and with routing it would also reveal the tier. The filter blanks `modelId` (and any `model` field) on `step.started`, the same way it blanks `providerMetadata` and usage.

## Trade-offs, accepted

- **Prompt cache.** Switching models between turns loses the provider's prompt cache. Conversations are short (a few turns), so this costs little.
- **Voice on Haiku.** Haiku carries the voice skill well but more plainly than Sonnet. DeepSeek is 30–50 times cheaper, but it stays a fallback only, because of the risk to the owner's Portuguese voice.
- **No deep-tier budget guard.** Opus is only twice Sonnet's price. If spend becomes a concern, a guard can cap `deep` to `standard` above a share of `TWIN_DAILY_SPEND_USD`.

## Testing

**Unit tests:**
- `modelIds`/tier chains: defaults, env overrides, de-duplicated chains, blank as absent;
- the classifier: object output, the previous-exchange prompt, the timeout fallback;
- the channel: the stored tier for each verdict and for an ended conversation;
- the resolver: the selection per tier, and `standard` on a missing row or a read error;
- the filter: `modelId` blanked on `step.started`.

**Live eval** (tags `live`, `routing`):
- "Oi, tudo bem?" runs on the light model;
- "Como você desenharia o pipeline de evals pra um agente RAG com release gates?" runs on the deep model;
- "Me conta do seu trabalho no Autodoc" runs on the standard model.

Assertions use the `modelId` of the turn's `step.started` events, if the eval API exposes them. Otherwise the eval asserts the stored `modelTier`. Check the evals docs.

**Offline evals** must still pass. The scripted mock model goes through the same dynamic resolver.
