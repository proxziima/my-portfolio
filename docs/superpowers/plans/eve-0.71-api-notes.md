# eve 0.71.0 API notes (portfolio twin, self-hosted)

Exact reference extracted from the installed package. Nothing here comes from memory.

- `$EVE` = `node_modules/.bun/eve@0.71.0+33e75dff224d38ab/node_modules/eve`
- Docs = `$EVE/docs/...`, types = `$EVE/dist/src/...` (`.d.ts`), and compiled JS where noted.
- **INFERENCE** marks a conclusion drawn from the sources that they do not state outright. **NOT AVAILABLE** means neither the docs nor the types offer the feature.
- File slots: the root agent lives in `agent/`. Tools go in `agent/tools/<name>.ts`, channels in `agent/channels/<name>.ts`, hooks in `agent/hooks/<slug>.ts`, instrumentation in `agent/instrumentation/<name>.ts`, memory in `agent/memory.ts` or `agent/memory/<slot>.ts`, schedules in `agent/schedules/<name>.ts`, instructions in `agent/instructions.{md,ts}` or `agent/instructions/*`, and evals in `evals/*.eval.ts` plus `evals/evals.config.ts` (source: `docs/reference/typescript-api.md`).

---

## 1. `defineAgent`

**Import:** `import { defineAgent, defineDynamic } from "eve";`
**Sources:** `docs/agent-config.md`, `docs/concepts/built-in-tools.md`, `dist/src/shared/agent-definition.d.ts`, `dist/src/public/definitions/agent.d.ts`, `dist/src/compiler/default-tool-policy.js`

```ts
// agent/agent.ts
import { defineAgent } from "eve";
import { anthropic } from "@ai-sdk/anthropic"; // any AI SDK provider -> LanguageModel

export default defineAgent({
  model: anthropic("claude-sonnet-5"),          // string | LanguageModel
  modelContextWindowTokens: 200_000,             // static model only
  modelOptions: { providerOptions: { anthropic: { /* JsonObject */ } } },
  reasoning: "low",
  compaction: { thresholdPercent: 0.75 },
  limits: {
    maxInputTokensPerSession: 200_000,
    maxOutputTokensPerSession: 20_000,
    maxTokenCostUsdPerSession: 0.5,
    sessionTimeoutMs: 24 * 60 * 60 * 1_000,
  },
  defaultTools: false,
  experimental: { workflow: { world: "@workflow/world-postgres", retention: 0 } },
  build: { externalDependencies: ["@workflow/world-postgres"] },
});
```

The exact field types, from `PublicAgentDefinition` in `shared/agent-definition.d.ts`:

| Field | Type | Notes |
|---|---|---|
| `model` | `string \| LanguageModel` (from `"ai"`) or `defineDynamic({events})` | Required when `agent.ts` exists. A string routes through the AI Gateway. A `LanguageModel` calls the provider directly. |
| `modelContextWindowTokens` | `number` | Only with a static model. Typed `never` with a dynamic model. |
| `modelOptions` | `{ readonly providerOptions?: Record<string, JsonObject> }` | Only with a static model. There is **no** top-level `providerOptions` field; it sits under `modelOptions`. |
| `reasoning` | `NonNullable<CallSettings["reasoning"]>`: `"provider-default" \| "none" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh"` | Omitting it uses the provider default. |
| `compaction` | `{ modelContextWindowTokens?: number; model?: string \| LanguageModel; thresholdPercent?: number }` | `thresholdPercent` defaults to `0.9`. Compaction is on by default. |
| `limits.maxInputTokensPerSession` | `number \| false` | Root default: `40_000_000`. |
| `limits.maxOutputTokensPerSession` | `number \| false` | Unset by default. |
| `limits.maxTokenCostUsdPerSession` | `number \| false` | Unset by default. Uses "the cost reported with each model step; AI Gateway supplies this value, while model steps without reported cost do not add to the limit" (`agent-config.md`). |
| `limits.sessionTimeoutMs` | `number \| false` | Default `2_592_000_000` (30 days). The clock starts at creation. |
| `defaultTools` | `boolean` | Defaults to `true`. |
| `experimental.workflow.world` | `string` (package name) | Root agent only. The package must export a default factory or `createWorld()`. |
| `experimental.workflow.retention` | `0 \| "default"` | Declared as `AGENT_WORKFLOW_RETENTION_VALUES = [0, "default"]`. |
| `experimental.workflow.modelCallsPerStep` | `number` | Defaults to `1`. |
| `build.externalDependencies` | `string[]` | Packaging only. These packages stay external and are traced into `server/node_modules`. |
| `description`, `tool` | `string`, `boolean` | `tool:false` on the root removes the built-in `agent` tool. |

**Usage limits.** The model call that crosses a limit is allowed to finish. Before the next call, eve pauses the session with an **Approve/Stop** continuation prompt: an `input.requested` with `kind: "session-limit"`. Sessions that cannot ask a human fail instead, with `SESSION_TOKEN_LIMIT_REACHED` or `SESSION_TOKEN_COST_LIMIT_REACHED`.

**Direct-provider caveat.** **INFERENCE** from the doc sentence above: with a direct `LanguageModel` whose steps report no `costUsd`, `maxTokenCostUsdPerSession` never trips. Enforce cost with the token limits, or compute cost yourself (§7).

**`defaultTools:false`.** The compiler (`default-tool-policy.js`) drops every framework-default `tools/*` slot, keeping only the connection tooling (`connection_search`/`connection_execute`). Dropped slots include `bash`, `read_file`, `write_file`, `web_fetch`, `web_search`, `agent` and `load_skill`. Files you author under `agent/tools/` stay. `task_wait`/`task_cancel` are added whenever a task-running tool exists (`built-in-tools.md`).

**Retention 0.** It is unsafe for a stream proxy. The docs say: "At `0`, a finished session's output is usually gone before you can read it." It applies to session-owning runs only. Workflow tools and session timeouts keep the world's default retention.

**Safety identifier.** For OpenAI and Anthropic calls, eve automatically fills `providerOptions.anthropic.metadata.userId` with a SHA-256 fingerprint of `auth.current`, unless you set it yourself.

**eve-bundled helpers.** `import { anthropic } from "eve/models/anthropic"` takes `anthropic(model?: string)`, defaults to `claude-sonnet-5`, reads `ANTHROPIC_API_KEY`, and accepts only the model ID.

---

## 2. Dynamic instructions

**Import:** `import { defineDynamic, defineInstructions } from "eve/instructions";`
**Sources:** `docs/instructions.mdx`, `docs/guides/dynamic-capabilities.md`, `dist/src/public/definitions/instructions.d.ts`, `dist/src/dynamic/definition.d.ts`, `dist/src/channel/types.d.ts`

```ts
// agent/instructions/visitor.ts
import { defineDynamic, defineInstructions } from "eve/instructions";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      defineInstructions({ content: `Session ${ctx.session.id}. Be concise.` }), // role defaults to "system"
    "turn.started": async (_event, ctx) => {
      const ctxText = await loadFreshContext(ctx.session.auth.current);
      return ctxText ? defineInstructions({ content: ctxText, role: "user" }) : null;
    },
  },
});
```

Signatures:

```ts
defineInstructions(def: { content: string; role?: "system" | "user" } | { markdown: string /* deprecated */ })
type DynamicInstructionsResult = InstructionsDefinition | null;
type DynamicInstructionsEvents = {
  readonly [K in "session.started" | "turn.started"]?:
    (event: unknown, ctx: DynamicResolveContext) => DynamicInstructionsResult | Promise<DynamicInstructionsResult>;
};
```

`step.started` is not accepted. `ExactDefinition` rejects it at the type level.

The resolver context, `DynamicResolveContext`, as declared in `dynamic/definition.d.ts`:

```ts
interface DynamicResolveContext {
  readonly abortSignal?: AbortSignal;                 // set only when resolving a dynamic model
  readonly model: { readonly id: string } | null;
  readonly session: { readonly id: string; readonly auth: SessionAuth };
  readonly channel: { readonly kind?: string; readonly continuationToken?: string;
                      readonly metadata?: Readonly<Record<string, unknown>> };
  readonly conversation?: ConversationContext;
  readonly messages: readonly ModelMessage[];         // oldest first
}
interface SessionAuth { readonly current: SessionAuthContext | null; readonly initiator: SessionAuthContext | null }
interface SessionAuthContext {
  readonly attributes: Readonly<Record<string, string | readonly string[]>>;
  readonly authenticator: string; readonly issuer?: string;
  readonly principalId: string; readonly principalType: string; readonly subject?: string;
}
```

**Role semantics** (from `instructions.mdx`):

- **System** results stay outside history. They are sent on every model call within their scope (the session, or the current turn). Every turn starts with fresh turn-scoped system instructions.
- **User** results are appended to durable history at the lifecycle boundary: session results first, then turn results, then the current delivery. There is no deduplication. Returning the same user content on a later turn appends it again. Replay is safe.
- `null` or blank content contributes nothing.
- Compaction may summarize user-role instructions. `clear` removes them and does not rerun resolvers.

**`ctx.messages` snapshots for instruction resolvers:**

- At `session.started`, `messages` includes the static user-role instructions.
- At `turn.started`, it also includes the user-role results from `session.started`, plus the history and the incoming message.

**Failure.** A throwing session resolver leaves any wider valid system selection in place. A throwing or empty turn result cannot leak the previous turn's value.

**Lifecycle.** A dynamic module's top-level code runs at both compile time and runtime. Keep caller-specific work inside the handlers.

---

## 3. `defineTool`, dynamic tools, `no_reply`, `disableTool`

**Import:** `import { defineTool, defineDynamic, disableTool, toolOutput, toolOutputPart } from "eve/tools";`
**Sources:** `docs/tools/overview.mdx`, `docs/guides/dynamic-capabilities.md`, `docs/concepts/built-in-tools.md`, `dist/src/tools/definition.d.ts`, `dist/src/tools/dynamic.d.ts`, `dist/src/tools/model-output.d.ts`, `dist/src/tools/provided/no-reply.d.ts`, `dist/src/context/session-context.d.ts`

```ts
// agent/tools/get_project.ts  -> model-facing name "get_project"
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Fetch one portfolio project by slug.",
  inputSchema: z.object({ slug: z.string() }),
  outputSchema: z.object({ title: z.string(), body: z.string() }), // optional; types execute's return
  async execute({ slug }, ctx) {
    void ctx.session.id; void ctx.callId; void ctx.abortSignal;
    return { title: "x", body: "y" };
  },
  toModelOutput: (out) => ({ type: "text", value: `${out.title}: ${out.body.slice(0, 500)}` }),
  endsTurn: false,
});
```

**`execute(input, ctx: ToolContext)`.** `ToolContext = SessionContext & { ... }` has these members:

- `ctx.session`: `{ id: string; auth: SessionAuth; turn: { id: string; sequence: number }; parent?: SessionParent }`
- `ctx.abortSignal: AbortSignal`, `ctx.callId: string`, `ctx.toolName: string`
- `ctx.messages: readonly ModelMessage[]`: the model input for the step that made the call. It excludes system messages.
- `ctx.getSandbox()`, `ctx.getToken(provider, opts?)`, `ctx.requireAuth(provider, opts?): never`

**Return shapes:**

- `execute` may be sync, async, or an async generator. Earlier yields become `action.partial` events, and the last yield becomes the result.
- Outputs must be JSON-serializable.
- A thrown error is reported to the model as a tool error. There is no automatic retry.

**`toModelOutput`.** `(output: TOutput) => ToolModelOutput | Promise<ToolModelOutput>`, where:

```ts
type ToolModelOutput =
  | { type: "text"; value: string }
  | { type: "json"; value: unknown }
  | { type: "content"; value: readonly ({ type: "text"; text: string }
      | { type: "file"; data: { type: "data"; data: string /*base64*/ }; mediaType: string; filename?: string })[] };
```

It affects only what the model sees. Hooks and channels still receive the full output on `action.result`.

**`endsTurn`.** Type: `boolean | ((output: TOutput) => boolean | Promise<boolean>)`.

- `true` appends a fixed sentence to the description the model sees.
- The turn ends only when every tool call in the step ends the turn and succeeds.
- It is ignored in delegated sessions and on turns that request structured output.
- `defineWorkflowTool` rejects it at build time.

### Dynamic tools

The import is `defineDynamic` **from `"eve/tools"`**. The same function is also re-exported from `eve`, `eve/skills`, `eve/instructions` and `eve/connections`, and the directory decides what the handler must return. Tool resolvers accept `session.started`, `turn.started` and `step.started`.

```ts
// agent/tools/book_call.ts
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";

export default defineDynamic({
  events: {
    "step.started": (_event, ctx) => {
      const eligible = ctx.session.auth.current?.attributes.tier === "verified";
      if (!eligible) return null;                       // tool absent for this model call
      return defineTool({                               // single entry -> named after file slug "book_call"
        description: "Request a call with the owner.",
        inputSchema: z.object({ email: z.string().email() }),
        execute: async ({ email }) => ({ queued: true, email }),
        endsTurn: false,                                // dynamic: only true/false, a function is rejected
      });
    },
  },
});
```

- **Handler signature:** `(event: unknown, ctx: DynamicResolveContext) => DynamicToolEntry | Record<string, DynamicToolEntry> | null` (sync or async).
- **Context:** the same as §2. For `step.started`, `ctx.messages` is that step's model input. `ctx.model` holds the effective model `{ id }`.
- **Naming:** a single entry takes the file slug. For a map, `dynamic-capabilities.md` says each entry gets its **bare key**, but the JSDoc in `dynamic/definition.d.ts` and `tools/dynamic.d.ts` says `slug__key`. The two conflict. Prefer single-entry files, or verify with `eve info`.
- **Durable callbacks:** callbacks must be inline functions or module-level references. Captured closure values must be JSON-serializable. `execute: makeExecutor()` (a call expression) is rejected.
- **Workflow tools:** a workflow body cannot be returned from `defineDynamic`. It must be a static tool (`workflows.mdx`, Rules).
- **Precedence:** a dynamic tool overrides a same-named authored tool. Two dynamic resolvers that emit the same name throw.

### `no_reply` (opt-in)

```ts
// agent/tools/no_reply.ts
import { noReply } from "eve/tools/no_reply";   // also re-exported from "eve/tools"
export default noReply();                        // (): ToolDefinition<{ reason?: string }, string>
```

`no_reply` is an `endsTurn: true` tool. The turn completes without a final message, and only root sessions receive the tool. You can also install it with `eve add tool/no_reply`.

### `disableTool()`

```ts
// agent/tools/web_search.ts
import { disableTool } from "eve/tools";
export default disableTool();   // removes the model tool whose name == this file's slug
```

`disableTool()` returns `DisabledToolSentinel { kind: "eve:disabled-tool" }`. It removes framework defaults and derived subagent tools that share the slug. A subagent hidden this way remains callable via `ctx.agent()`.

---

## 4. `defineWorkflowTool`

**Import:** `import { defineWorkflowTool, type WorkflowToolContext, type WorkflowStepToolContext } from "eve/tools";` and `import { createWebhook, createHook, sleep, FatalError, RetryableError } from "workflow";`
**Sources:** `docs/tools/workflows.mdx`, `docs/tools/tasks.md`, `dist/src/tools/workflow-definition.d.ts`, `dist/src/compiled/@workflow/core/create-hook.d.ts`, `dist/src/compiled/@workflow/core/sleep.d.ts`, `dist/src/public/workflow-modules.d.ts`, `dist/src/execution/workflow-webhook-route.d.ts`

**Rules** (from `workflows.mdx`):

- Default-export exactly one entry point: `execute`, `task` or `serve`.
- `"use workflow"` must be the **first statement** of the entry point. A missing directive is a build error.
- `"use step"` marks a **top-level** `async function`, in the tool module or a module it imports, as a step. Side effects, clocks, randomness, `process.env` and Node APIs belong in steps. The workflow body replays and must stay deterministic.
- `createHook`, `createWebhook`, `sleep` and `FatalError` come from `"workflow"` and are used in the body. `start`, `getRun` and `resumeHook` come from `"workflow/api"` and belong in steps.
- Your app does not install the SDK. For types, add `"eve/workflow-modules"` to `tsconfig` `types`. `workflow-modules.d.ts` declares ambient `module "workflow"` and `"workflow/api"`.
- Tool input must be a JSON object.

**Context:**

- **`execute`/`task` body:** `ctx: WorkflowToolContext` provides `session`, `callId`, `toolName`, `abortSignal`, `agent(name)`, `agents` and `ask(request, opts?)`.
- **`"use step"` helper that receives `ctx`:** gets `WorkflowStepToolContext`, which provides `session`, `callId`, `toolName`, `abortSignal`, `getToken` and `requireAuth`. It has no `agent`, `agents` or `ask`. `getSandbox` is unavailable everywhere in workflow tools.

**Signatures** (from `workflow-definition.d.ts`):

```ts
execute(input: TInput, ctx: WorkflowToolContext): Promise<TOutput> | AsyncIterable<TOutput>;
task(input: TInput, ctx: WorkflowToolContext): Promise<TOutput> | AsyncIterable<TOutput>;
serve(receive: WorkflowServeReceive<TInput>, ctx: WorkflowServeContext<TOutput>): Promise<TOutput>;
toModelOutput?: (output: TOutput) => ToolModelOutput | Promise<ToolModelOutput>;  // also: approval, label, outputSchema, availableInSubagents
// NOT accepted: endsTurn (build error), execution (throws: "execution" was replaced by task()...)
```

Webhook and sleep primitives, as declared in `create-hook.d.ts` and `sleep.d.ts`:

```ts
declare function createWebhook(options?: WebhookOptions): Webhook<Request>;
declare function createWebhook(options: WebhookOptions & { respondWith: "manual" }): Webhook<RequestWithResponse>;
interface Webhook<T extends Request> extends Hook<T> { url: string }   // Hook<T> is Thenable<T> + AsyncIterable<T>, has token, dispose()
interface WebhookOptions { respondWith?: Response | "manual"; metadata?: Serializable }  // token NOT accepted for webhooks
declare function sleep(duration: StringValue /* "4h" */ | Date | number /* ms */): Promise<void>;
```

**Webhook URL.**

- `createWebhook()` mints a URL under `/.well-known/workflow/v1/webhook/:token`. That is the `WORKFLOW_WEBHOOK_ROUTE_PATTERN` constant.
- The token is generated, and an explicit token is not accepted.
- `create-hook.d.ts` warns: "A generated token is not trivial to guess but is not a security contract, so authenticate webhook requests themselves rather than relying on URL secrecy."

**Reading the body.** Await the hook to get the `Request`, then call `.json()`, `.text()` and so on. This is copied from `workflows.mdx`:

```ts
// agent/tools/render_video.ts (verbatim pattern)
import { defineWorkflowTool } from "eve/tools";
import { createWebhook, FatalError } from "workflow";
import { z } from "zod";

export default defineWorkflowTool({
  description: "Render a video. Returns the URL once the render farm finishes.",
  inputSchema: z.object({ projectId: z.string() }),
  async execute({ projectId }) {
    "use workflow";
    const done = createWebhook();
    const jobId = await submitRender(projectId, done.url);   // submitRender is a "use step" fn
    const callback = await done;                               // Request
    const { status, url } = await callback.json();
    if (status !== "ok") throw new FatalError(`Render ${jobId} failed: ${status}`);
    return { url };
  },
});
```

**Promise.race deadline.** This pattern is documented with `ctx.ask`:

```ts
const pending = ctx.ask({ prompt: `Deploy ${service}?`, options: APPROVE_OR_CANCEL });
const answer = await Promise.race([pending, sleep("4h")]);
if (answer === undefined) return { deployed: false, reason: "timed out" };
```

**INFERENCE:** the same composition works for a webhook, because `Webhook` is a `Thenable<Request>` and `sleep` resolves to `undefined`:

```ts
const hook = createWebhook();
const req = await Promise.race([hook, sleep("24h")]);
if (req === undefined) return { status: "timeout" };
const body = await req.json();
```

Caveat from `workflows.mdx`: "A body parked on a hook or a `sleep` does not observe the signal". A steering message therefore does not wake a body parked on a webhook. For an `execute` call, that keeps the turn waiting until the body finishes.

**`execute` vs `task`:**

| | `execute` | `task` |
|---|---|---|
| Turn | Parks the turn until the call settles. A steering message aborts `ctx.abortSignal`. | Returns a receipt immediately and the conversation continues. Steering never aborts it. |
| Result | The tool result. | Arrives later as `<task_result id="…" tool="…" status="completed">…</task_result>` inside a `task.result` message, appended at the next step boundary. |
| `toModelOutput` | Projects the result. | Projects the **result, not the receipt**. |
| Limits | | 32 working tasks per session. A turn cannot end while tasks are working. The model gets `task_wait`/`task_cancel`. |

**Receipt text** (verbatim from `tasks.md`; task ids are `<tool>-<6 chars>`):

```text
Started task deploy-4hd8sa. Its result will arrive in a <task_result> message.
Started task researcher-7k2m9q. Its result will arrive in a <task_result> message. To send it another message, call researcher again with taskId researcher-7k2m9q.
Sent to task researcher-7k2m9q. Its reply will arrive in a <task_result> message.
```

**Errors and retries.**

- A thrown error in a step retries according to the step's policy. `FatalError` does not retry.
- An error that escapes the body fails the tool invocation.
- Dispatch can be retried and produce **two runs**. Use idempotency keys for side effects.

**Stream events for tasks.** `task.started` and `task.settled` carry `taskId`, `callId`, `turnId`, `name`, `kind` and `status`, plus `output` or `error.message`.

---

## 5. Channels

### `eveChannel`

**Import:** `import { eveChannel, defaultEveAuth } from "eve/channels/eve";`
**Sources:** `docs/channels/eve.mdx`, `dist/src/eve-channel/types.d.ts`, `dist/src/eve-channel/support.js` (compiled)

```ts
// agent/channels/eve.ts  (replaces the default; keeps all /eve/v1 routes)
import { eveChannel, defaultEveAuth } from "eve/channels/eve";
import { jwtHmac, localDev } from "eve/channels/auth";

export default eveChannel({
  auth: [jwtHmac({ algorithm: "HS256", issuer: "portfolio-web", audiences: ["portfolio-twin"], secret: process.env.TWIN_JWT_SECRET! }), localDev()],
  cors: { origin: "https://example.com", methods: ["GET", "POST"], allowedHeaders: ["authorization", "content-type"] },
  turnPolicy: "queue",
  uploadPolicy: "disabled",
  audience: "public",
  async onMessage(ctx, message) {
    return { auth: defaultEveAuth(ctx), context: ["Visitor is on /projects"], title: "Visitor chat" };
  },
  events: { "message.completed"(data, _channel, ctx) { void data.message; void ctx.session.id; } },
});
```

`EveChannelInput`, exact:

```ts
interface EveChannelInput {
  readonly auth: AuthFn<Request> | readonly AuthFn<Request>[];                          // required
  readonly audience?: "public" | "private" | "unknown" | ((input: Omit<AudienceContext<undefined>, "state">) => ChannelAudience);
  readonly trustedForwarders?: TrustedForwarders;
  readonly uploadPolicy?: "disabled" | Partial<{ maxBytes: number; allowedMediaTypes: readonly string[] | "*" }>; // default 25 MB, all types; 413/415 on violation
  readonly cors?: boolean | { origin?: "*" | "null" | string | readonly string[]; methods?: "*" | readonly ChannelMethod[];
                             allowedHeaders?: "*" | readonly string[]; exposedHeaders?: "*" | readonly string[];
                             credentials?: boolean; maxAge?: number | false; preflightStatus?: number };
  readonly turnPolicy?: "steer" | "queue";                                              // default "steer"
  readonly onMessage?: (ctx: EveMessageContext, message: string | UserContent) => EveMessageResult | Promise<EveMessageResult>;
  readonly events?: ChannelEvents<ChannelContinuationOps>;
}
interface EveMessageContext { readonly eve: { caller: SessionAuthContext | null; invocation?: { operationId: string };
                                            request: Request; sessionId?: string } }
type EveMessageResult = { readonly auth: SessionAuthContext | null; readonly context?: readonly string[]; readonly title?: string };
```

**`onMessage` behavior:**

- **Async:** it can be async. It returns `EveMessageResult | Promise<EveMessageResult>`.
- **When it runs:** after route auth and body parsing, before dispatch. A message-free `POST /eve/v1/session` skips it.
- **Throwing or rejecting:** it can, but you cannot choose the status code. In compiled `support.js`, any throw, or a `null`/`undefined` return, is caught, logged, and turned into **HTTP 500** `{"error":"onMessage handler failed.","errorId":"…","ok":false}`. An `UnauthenticatedError` or `ForbiddenError` thrown here is **not** converted to 401 or 403; only `routeAuth` does that. To reject with 401 or 403, do it in the `auth` walk.
- **`context`:** each string is "prepended as user messages". Per `SendPayload.context` in `channel/routes.d.ts`, eve appends each entry as a `role: "user"` message to session history **before** the delivery message and **persists it** across the session. It is not system-role.
- **`title`:** sets the session title when the dispatch creates the session.

**Default auth.** Without an authored `channels/eve.ts`, the policy is `[vercelOidc(), localDev(), placeholderAuth()]`, which rejects all production traffic.

**Health.** `GET /eve/v1/health` is public: it skips the walk.

**Audience defaults.**

- Anonymous callers get `unknown`.
- `user`, `service` and `runtime` principals get `private`.
- Audience is fixed at creation. It controls trace content capture, not access.

### Auth helpers

**Import:** `import { jwtHmac, localDev, none, routeAuth, UnauthenticatedError, ForbiddenError, extractBearerToken, verifyJwtHmac, withAuthChallenges, createUnauthorizedResponse, httpBasic, type AuthFn } from "eve/channels/auth";`
**Sources:** `dist/src/public/channels/auth.d.ts`, `dist/src/channel/auth/jwt-hmac.js`, `dist/src/channel/auth/token-claims.js`, `docs/guides/auth-and-route-protection.md`

```ts
type AuthFn<TEvent = Request> = (event: TEvent) => SessionAuthContext | null | undefined | Promise<SessionAuthContext | null | undefined>;
declare function jwtHmac(config: VerifyJwtHmacConfig): AuthFn<Request>;
interface VerifyJwtHmacConfig {
  readonly algorithm: "HS256" | "HS384" | "HS512";
  readonly audiences: readonly string[];       // note: plural, array
  readonly issuer: string;
  readonly secret: string;
  readonly clockSkewSeconds?: number;          // default 30
  readonly subjects?: readonly string[];       // `*`-wildcard patterns vs `sub`
  readonly claims?: Readonly<Record<string, readonly string[]>>; // each claim must contain one listed value
}
declare function localDev(): AuthFn<Request>;              // only when EVE_DEV=1 or (VERCEL=1 && VERCEL_ENV=development); null under `eve start`
declare function none<TEvent = unknown>(): AuthFn<TEvent>; // synthetic principalType "anonymous"; terminates the walk
declare function routeAuth(request: Request, auth: AuthFn<Request> | readonly AuthFn<Request>[]): Promise<SessionAuthContext | Response>;
declare class UnauthenticatedError extends Error { readonly response: Response; constructor(opts?: { code?: string; message?: string; challenges?: readonly UnauthorizedChallenge[] }) } // 401
declare class ForbiddenError extends Error { /* same */ }                                                                                                                    // 403
```

**Mapping JWT claims to a principal.** There is **no option** for this in `jwtHmac`: the claim→principal mapping is NOT AVAILABLE. Compiled `jwt-hmac.js` and `token-claims.js` hard-code the mapping:

- `principalType: "service"`, always.
- `authenticator: "jwt-hmac"`.
- `issuer`: the `iss` claim. `subject`: the `sub` claim.
- `principalId`: `` `${iss}:${sub}` ``.
- `attributes`: every non-standard string or string[] claim. These keys are excluded: `aud`, `exp`, `iat`, `iss`, `jti`, `nbf`, `sub`.
- A token without a non-empty `sub` is not authenticated.

For a custom `principalType` such as `"user"`, write your own `AuthFn` around `verifyJwtHmac`, then remap `result.sessionAuth`:

```ts
const twinAuth: AuthFn<Request> = async (request) => {
  const r = await verifyJwtHmac(extractBearerToken(request.headers.get("authorization")), {
    algorithm: "HS256", issuer: "portfolio-web", audiences: ["portfolio-twin"], secret: process.env.TWIN_JWT_SECRET!,
  });
  return r.ok ? { ...r.sessionAuth, principalType: "user" } : null;   // INFERENCE: remapping is plain object spread
};
```

**Walk semantics:**

- A returned principal is accepted, and the walk stops.
- `null`/`undefined` skips to the next entry.
- An `UnauthenticatedError` or `ForbiddenError` is caught by `routeAuth`, which returns that error's response. Any other error goes through the normal channel failure path.
- If every entry skips, the result is a 401 with challenges collected from the entries.

### Custom channel `defineChannel`

**Import:** `import { defineChannel, POST, GET, disableRoute, type RouteHandlerArgs } from "eve/channels";`
**Sources:** `docs/channels/custom.mdx`, `docs/channels/overview.mdx`, `dist/src/public/definitions/channel.d.ts`, `dist/src/channel/routes.d.ts`, `dist/src/channel/session.d.ts`, `dist/src/channel/types.d.ts`

```ts
// agent/channels/webhooks.ts   (route path is NOT prefixed by the file name)
import { defineChannel, POST } from "eve/channels";

export default defineChannel({
  routes: [
    POST("/hooks/booking", async (request, { attachSession, waitUntil, requestIp }) => {
      const raw = await request.text();                     // raw body: standard Request
      if (!verifySignature(request.headers, raw)) return new Response("unauthorized", { status: 401 });
      const { sessionId, summary } = JSON.parse(raw);
      waitUntil(
        attachSession(sessionId).send(`Booking confirmed: ${summary}`, {
          auth: { authenticator: "booking-webhook", principalType: "service", principalId: "booking", attributes: {} },
          context: ["[system note] Booking provider callback, not visitor text."],
          turnPolicy: "queue",
        }),
      );
      return new Response("ok");
    }),
  ],
});
```

**Handler.**

- `type RouteHandler<TState> = (req: Request, args: RouteHandlerArgs<TState>) => Promise<Response>`
- `POST(path: string, handler)`. The other verbs are `GET`, `HEAD`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` and `WS`.
- `RouteHandlerArgs = { from, resolveSession, attachSession, to, params, waitUntil: (task: Promise<unknown>) => void, requestIp: string | null }`.
- The raw body is the standard `Request`: `await request.text()`, `.json()` or `.arrayBuffer()`.
- Do not use the `/eve/v1/*` namespace.

**`attachSession(sessionId)`.** I/O-free. It returns a `Session` pinned to that ID, and the first operation reports whether the session is active. Methods, from `channel/session.d.ts`:

```ts
send(message: string | UserContent, options: SessionSendOptions): Promise<SessionSendCommandResult>;
respond(inputResponses, options: SessionRespondOptions): Promise<SessionSendCommandResult>;
cancel(options?: { turnId?: string }): Promise<CancelTurnResult>;
compact(): Promise<CompactSessionResult>; clear(): Promise<ClearSessionResult>;
reset(options?: { reason?: string }): Promise<ResetSessionResult>;
getEventStream(options?: { startIndex?: number }): Promise<ReadableStream<MessageStreamEvent>>;
getStreamTailIndex(): Promise<number>;
type SessionSendOptions = { auth: SessionAuthContext | null; callback?: SessionCallback; context?: readonly string[];
                            outputSchema?: JsonObject; title?: string; turnPolicy?: "steer" | "queue" };
type SessionSendCommandResult = { status: "accepted"; sessionId: string; deliveryId?: string }
                              | { status: "session_not_active"; retryable?: boolean };
```

**Which principal to send as from a webhook.** The docs define no "webhook principal".

- `auth` is required and may be `null`.
- With `null` on a continuation, `auth.current` becomes `null` and `auth.initiator` stays pinned.
- The documented cross-channel example passes a hand-built `{ authenticator, principalType: "service", principalId, attributes: {} }`, and the example above uses the same shape. Using it for `attachSession` is **INFERENCE**.

Consequences documented in `sessions-runs-and-streaming.md` and `channels/overview.mdx`:

- "Only the turn's own caller steers it; another caller's message waits for the turn to end."
- Queued messages coalesce only when their full auth contexts match.

**Marking the message as system or context.**

- A system-role injection through a channel send is NOT AVAILABLE. `message` is required (`string | UserContent`).
- `context?: string[]` entries become **user-role** messages placed before the message and persisted in history.
- The documented way to add system-role content per turn is a `turn.started` dynamic instruction (§2) that reads your own store. Pairing that with a webhook is **INFERENCE**.

**`waitUntil`** keeps background work alive after the response.

**Both `channels/eve.ts` and `channels/webhooks.ts`?** **Yes.** `channels/overview.mdx` shows `agent/channels/{eve.ts,slack.ts,intake.ts}` side by side, and each file stem is a channel id. An `eveChannel(...)` in `eve.ts` keeps the standard `/eve/v1` routes. Note that a custom `defineChannel(...)` *in the `eve.ts` slot* would expose only its own routes.

Other `defineChannel` options:

- `turnPolicy`, `cors` (`{ origin, methods, allowHeaders }`; this key is `allowHeaders`, while eveChannel's is `allowedHeaders`)
- `state`, `metadata(state)`, `audience(input)`, `context(state, session)`, `events`, `fetchFile`, `receive`

---

## 6. Hooks

**Import:** `import { defineHook, type HookContext } from "eve/hooks";`
**Sources:** `docs/guides/hooks.md`, `docs/concepts/state.md`, `dist/src/public/definitions/hook.d.ts`, `dist/src/protocol/message.d.ts`

```ts
// agent/hooks/transcript.ts  -> slug "transcript"
import { defineHook } from "eve/hooks";

export default defineHook({
  events: {
    async "message.completed"(event, ctx) {
      if (event.data.finishReason === "tool-calls") return;   // interim narration
      await saveAssistantText(ctx.session.id, event.data.turnId, event.meta.id, event.data.message);
    },
    async "message.received"(event, ctx) { await saveUserText(ctx.session.id, event.data.turnId, event.data.message); },
    async "turn.started"(_event, ctx) { if (blocked(ctx.session.auth.current)) ctx.cancel(); },
  },
});
```

**Event names.** These are the `HookEventMap` keys; `"*"` matches all:

- `action.input.appended`, `action.partial`, `action.result`, `actions.requested`
- `approval.candidate`, `approval.settled`
- `agent.started`
- `authorization.completed`, `authorization.required`
- `compaction.completed`, `compaction.requested`, `context.cleared`
- `input.requested`, `input.resolved`
- `message.appended`, `message.completed`, `message.received`
- `reasoning.appended`, `reasoning.completed`, `result.completed`
- `session.completed`, `session.failed`, `session.started`, `session.waiting`
- `step.completed`, `step.failed`, `step.started`
- `task.settled`, `task.started`
- `turn.cancelled`, `turn.completed`, `turn.failed`, `turn.started`, `turn.waiting`

**Handler.** `(event, ctx: HookContext) => void | Promise<void>`. `event` is the full envelope: `{ type, data, meta: { id: "evt_<ULID>", at: ISO string, deliveryIds? } }`.

**Exact payloads** (from `protocol/message.d.ts`):

```ts
"message.completed": { data: { finishReason: "content-filter"|"error"|"length"|"other"|"stop"|"tool-calls";
                                message: string; sequence: number; stepIndex: number; turnId: string } }
// assistant only, full text of that block. NO role, NO message id field, NO parts.
"message.received":  { data: { message: string; parts?: MessageReceivedPart[]; sequence: number; turnId: string } } // user input
"turn.started":      { data: { sequence: number; trace?: { traceId; spanId; traceFlags }; turnId: string } }
"session.started":   { data: { invocation?: …; runtime?: RuntimeIdentity; trace?: RuntimeTraceContext } }
```

`message.completed` can fire more than once per turn. Use `finishReason !== "tool-calls"` to find the terminal reply.

**`HookContext`.** `extends SessionContext` (`session.{id, auth, turn, parent?}`, `getSandbox()`), plus:

- `agent: { name; nodeId? }`
- `channel: { kind?; continuationToken? }`
- `cancel(): void`

**`cancel()`:**

- It stops the running turn (`turn.cancelled` then `session.waiting`).
- From `turn.started` or `step.started`, it takes effect before that model call.
- It is ignored, with a warning, on these events: `step.failed`, `turn.completed`, `turn.failed`, `turn.cancelled`, `turn.waiting`, `session.waiting`, `session.completed`, `session.failed`, `context.cleared`, `task.started`, `task.settled` and `agent.started`.

**Read and write:**

- Hooks are "observe-only. They cannot inject model context". Use dynamic instructions for that.
- They **can** read and update `defineState` slots, which come from `eve/context`. `state.md` resets a budget with `budget.update(...)` from a `turn.started` hook.
- They can use `ctx.getSandbox()` and external I/O.

**Delivery semantics:**

- Hooks run after the event is durably written: typed handlers first, then `*`.
- They are **at-least-once**. A retried step re-emits events with **new** `meta.id`s.
- Throws are logged and the remaining subscribers still run. There is no veto and no retry.
- Key once-per-turn side effects on `data.turnId`, `data.stepIndex` and `data.sequence`. Key stored rows on `meta.id`.
- Root hooks do not fire for subagent turns.

---

## 7. Instrumentation (`model.call.completed`)

**Import:** `import { defineInstrumentation } from "eve/instrumentation";`
**Sources:** `docs/guides/instrumentation/instrumentation.mdx`, `dist/src/instrumentation/lifecycle.d.ts`, `dist/src/instrumentation/provider.d.ts`, `dist/src/instrumentation/state.d.ts`

```ts
// agent/instrumentation/cost.ts
import { defineInstrumentation } from "eve/instrumentation";

export default defineInstrumentation({
  tracePolicy: () => ({ emit: true, recordInputs: false, recordOutputs: false }),
  events: {
    "model.call.started": (e, ctx) => ctx.state.set({ modelId: e.model.modelId, provider: e.model.provider }),
    "model.call.completed": async (e, ctx) => {
      const m = ctx.state.get() as { modelId: string; provider: string } | undefined;
      const u = e.usage;
      await recordCost({
        sessionId: e.scope.sessionId, turnId: e.scope.turnId, key: e.idempotencyKey, modelId: m?.modelId ?? e.responseModelId,
        input: u.inputTokens ?? 0, output: u.outputTokens ?? 0,
        cacheRead: u.inputTokenDetails?.cacheReadTokens ?? 0, cacheWrite: u.inputTokenDetails?.cacheWriteTokens ?? 0,
        reportedUsd: u.costUsd,
      });
    },
  },
});
```

Exact types:

```ts
interface InstrumentationModelCallCompletedEvent {
  readonly type: "model.call.completed";
  readonly content?: readonly InstrumentationContentPart[];   // only if trace policy records outputs
  readonly finishReason: string;
  readonly idempotencyKey: string;                            // shared with its model.call.started
  readonly responseModelId?: string;
  readonly responseId?: string;
  readonly scope: InstrumentationAttemptScope;                // { sessionId, turnId, stepIndex, attemptId, attemptIndex, rootSessionId?, … }
  readonly usage: InstrumentationUsage;
}
interface InstrumentationUsage { costUsd?: number; inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
                                 inputTokens?: number; outputTokens?: number }
interface InstrumentationModelCallStartedEvent { type: "model.call.started"; idempotencyKey: string; input?: …;
                                                 model: { modelId: string; provider: string }; scope: …; runtimeContext?: … }
```

- **`providerMetadata`:** this event does **not** carry it. It arrives on a separate `step.attempt.metadata` event, `{ idempotencyKey, scope, providerMetadata: Record<string, unknown> }`, which is "emitted after a step only when the AI SDK supplies provider metadata".
- **`costUsd`:** "Provider-reported cost in US dollars. Absent when the provider omits pricing."
- **`ctx.state`:** an `InstrumentationStateSlot { get(): JsonValue | undefined; set(v: JsonValue | undefined): void }`. It is scoped to this file and this operation (`idempotencyKey`), survives durable suspension, and is released after the terminal event.
- **`ProviderDefinition` fields:** `tracePolicy?`, `events?`, `setup?`, `flush?`, `shutdown?`.
- **Concurrency:** handlers in different files run concurrently and in isolation from one another's failures.

Per-session running usage is also available on the stream. `session.waiting`, `turn.waiting`, `session.failed` and `session.completed` carry `data.usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd? }`. `step.completed.data.usage` is the per-step usage (`message.d.ts`).

---

## 8. Memory

**Import:** `import { defineMemory, defineMemoryProvider } from "eve/memory";` and `import { byPrincipal } from "eve/memory/scope";`
**Sources:** `docs/memory/overview.mdx`, `docs/memory/custom-provider.md`, `dist/src/public/memory/index.d.ts`, `dist/src/public/memory/scope.js` (compiled)

```ts
// agent/memory/visitor.ts   (slot "visitor"; use agent/memory.ts for a single slot named "memory" — the two forms are mutually exclusive)
import { defineMemory, defineMemoryProvider } from "eve/memory";
import { byPrincipal } from "eve/memory/scope";

const provider = defineMemoryProvider({
  recall: {
    async "turn.started"(ctx) {
      const rows = await db.recall(ctx.memory.scope.key, ctx.turn.input);
      return { messages: rows.map((r) => ({ id: r.id, content: r.text })) };   // or null / undefined
    },
  },
  capture: {
    async "turn.completed"(ctx) {
      await db.ingest(ctx.memory.scope.key, ctx.operationId, ctx.messages);    // operationId = idempotency key
    },
  },
});

export default defineMemory({ description: "Facts this visitor shared.", provider, scope: byPrincipal });
```

Exact shape:

```ts
interface MemoryProvider {
  readonly recall: { readonly "turn.started": (ctx: MemoryTurnStartedContext) => MemoryRecallResult | Promise<MemoryRecallResult>;
                     readonly "compaction.completed"?: (ctx: MemoryCompactionCompletedContext) => … };
  readonly capture?: { readonly "turn.completed"?: (ctx: MemoryTurnCompletedContext) => void | Promise<void>;
                       readonly "compaction.requested"?: (ctx: MemoryCompactionRequestedContext) => void | Promise<void> };
  readonly tools?: (ctx: MemoryToolsContext) => Promise<Record<string, MemoryToolDefinition> | null>;  // exposed as <slot>__<key>
}
type MemoryRecallResult = { readonly messages: readonly { content: string; id?: string }[] } | null | undefined;
interface MemoryOperationContext extends SessionContext {
  abortSignal: AbortSignal; messages: readonly ModelMessage[]; operationId: string;
  memory: { scope: { key: string; namespace: string; value: string | readonly string[] }; slot: string };
}
// MemoryTurnStartedContext / MemoryTurnCompletedContext add: turn: { id: string; input: readonly ModelMessage[]; sequence: number }
interface MemoryDefinition { description?: string; namespace?: string | null | ((c) => string | null | Promise<string | null>);
  provider: MemoryProvider; scope: string | null | ((c: MemoryScopeContext) => string | readonly string[] | null | Promise<…>);
  visibility?: "scope" | "session" }
declare function byPrincipal(context: MemoryScopeContext): string | null;
```

**`byPrincipal`.** Compiled body:

```js
const DISABLED = new Set(["anonymous", "runtime"]);
t = ctx.session.auth.current;
return t === null || DISABLED.has(t.principalType)
  ? null
  : t.principalType === "local-dev"
    ? "local-dev"
    : JSON.stringify([t.principalType, t.authenticator, t.issuer ?? null, t.principalId]);
```

Memory is therefore **disabled** for `none()`, which produces `anonymous`. It is **enabled** for `jwtHmac`, which produces `service`, and the scope is keyed per JWT `sub`. A `null` scope disables the slot for that operation, and there is no fallback to a shared scope.

**Recall semantics:**

- Recalled messages enter context as **user-role** messages attributed to the slot. They are never system messages.
- A message with the same `id` supersedes the earlier one. A message without an id accumulates.
- A throwing `recall["turn.started"]` fails the turn before the model call.
- A throwing `capture["turn.completed"]` is logged only.

---

## 9. Schedules

**Import:** `import { defineSchedule, isScheduleAuth } from "eve/schedules";`
**File:** `agent/schedules/<name>.ts` (nested dirs allowed; the name is the path, e.g. `billing/sweep`), or `<name>.md` with `cron` frontmatter.
**Source:** `docs/schedules.mdx`

```ts
// agent/schedules/digest.ts
import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: "0 9 * * 1-5",                           // 5-field, minute granularity
  async run({ to, waitUntil, appAuth }) {        // exactly one of `markdown` | `run`
    await pruneOldRows();                        // INFERENCE: plain code without sending is allowed ("The handler is in full control")
    // waitUntil(to(someChannel, target).send("…", { auth: appAuth }));
  },
});
```

```ts
interface ScheduleDefinition { cron: string; markdown?: string; run?: (args: ScheduleHandlerArgs) => Promise<void> | void }
interface ScheduleHandlerArgs { to: ScheduleToFn; waitUntil: (task: Promise<unknown>) => void; appAuth: SessionAuthContext }
// appAuth = { authenticator: "app", principalId: "eve:app", principalType: "runtime" }
```

**`run` arguments.** `run` gets no `SessionContext`: it has no `ctx.session` and no `ctx.getSandbox`.

**Firing:**

- `eve dev` never fires schedules on their cron.
- To trigger one in dev, `POST /eve/v1/dev/schedules/:scheduleId`. This route is dev only.
- `eve build && eve start` starts Nitro's schedule runner, so schedules fire in a self-hosted container.

**Markdown form.** Each fire starts a new session with no channel. A tool that needs approval fails the session.

---

## 10. Evals

**Import:** `import { defineEval, defineEvalConfig, mockModel } from "eve/evals";` and `import { includes, equals, matches, satisfies, similarity } from "eve/evals/expect";`
**Sources:** `docs/evals/{overview,cases,assertions,judge,targets,running,reporters}.mdx`, `docs/reference/cli.md`, `dist/src/evals/{index,mock-model,types}.d.ts`, `dist/src/evals/expect/index.d.ts`

```ts
// evals/evals.config.ts  (exactly one, required, at the root of evals/)
import { defineEvalConfig } from "eve/evals";
import { anthropic } from "@ai-sdk/anthropic";
export default defineEvalConfig({
  judge: { model: anthropic.evaluationModel("claude-sonnet-5") },  // INFERENCE: docs show only openai.evaluationModel(...)
  maxConcurrency: 4,
  timeoutMs: 120_000,
});
```

```ts
// evals/twin/booking.eval.ts  -> id "twin/booking"
import { defineEval } from "eve/evals";
import { includes, matches, satisfies } from "eve/evals/expect";
import { z } from "zod";

export default defineEval({
  description: "Books a call only after email is given.",
  tags: ["twin", "fast"],
  async test(t) {
    const first = await t.send("Can I book a call with you?");
    first.notCalledTool("book_call");
    t.check(first.message, includes(/email/i));

    const second = await first.session.send("Sure, it's ana@example.com");
    second.calledTool("book_call", { input: { email: "ana@example.com" }, count: 1 });
    t.check(second.message, satisfies((m: string | undefined) => (m ?? "").length < 600, "short reply"));

    t.succeeded();
    t.judge("The assistant stays in character as the portfolio owner.", { on: first.session.transcript }).atLeast(0.8);
  },
});
```

**Driving the agent:**

- `t.send(msg, opts?)` creates a new session and waits for the turn to settle. The returned turn has `.message`, `.data`, `.events`, `.inputRequests`, `.toolCalls`, `.session`, `.sessionId`, `.status` and `.expectOk()`.
- **Multi-turn:** continue with `turn.session.send(...)`. `t.session()` creates an empty session.
- **Other session methods:** `start`, `cancel`, `respond`, `respondAll`, `sendFile`, `requireInputRequest`, `compact`, `transcript` and `events`.

**Assertions.** The `t.*` forms read the whole run. Session and turn objects have the same methods.

- `succeeded()`, `parked()`, `messageIncludes(token)`
- `calledTool(name, { input?, output?, status?, count? })`, `notCalledTool(name)`, `toolOrder([...])`, `usedNoTools()`, `maxToolCalls(n)`, `noFailedActions()`
- `calledSubagent(...)`, `event(type, opts?)`, `notEvent`, `eventOrder([...])`, `eventsSatisfy(label, fn)`
- `t.check(value, assertion)` and `await t.require(value, assertion)`
- `calledTool` and `usedNoTools` are mutually exclusive.

**Expectation builders:**

```ts
declare function includes(substring: string | RegExp): Assertion;          // gate
declare function equals(expected: unknown): Assertion;                     // gate
declare function matches(schema: StandardSchemaV1): Assertion;             // gate
declare function satisfies<T = unknown>(predicate: (value: T) => boolean, label: string): Assertion; // gate
declare function similarity(expected: string): Assertion;                  // soft
```

**Severity:**

- `.gate(threshold?)`, `.soft(threshold?)`, `.atLeast(threshold)`, `.label(name)`.
- Judges are soft by default.
- `--strict` turns soft threshold misses into failures.

**Judge with a non-Gateway model.**

- Use the provider's **`evaluationModel` factory, not a `LanguageModel`**. The documented example is `t.judge("…", { model: openai.evaluationModel("gpt-6-luna"), modelOptions: { providerOptions: { openai: { reasoningEffort: "high" } } } })`.
- `EveEvalJudgeConfig = { model?: EvaluationModel; modelOptions?: AgentModelOptionsDefinition }`.
- Resolution order: per call, then per eval (`defineEval({ judge })`), then the config, then the default `typesafe-ai/jev` through Gateway.
- Missing credentials make it a **failed gate**, even when the judgment is tracked-only.
- Whether `@ai-sdk/anthropic` exposes `evaluationModel` is **not verified** here. Check the installed provider. The docs call provider support "experimental".

**`mockModel`.** Exact signature:

```ts
declare function mockModel(input?: MockModelOptions | MockModelResponder | string): LanguageModel;
interface MockModelOptions { modelId?: string; provider?: string; respond?: MockModelResponder | string }
type MockModelResponder = (req: MockModelRequest) => MockModelResponse | Promise<MockModelResponse | string> | string;
interface MockModelRequest { messages: { role: "assistant"|"system"|"tool"|"user"; text: string }[]; userMessages: string[];
  lastUserMessage: string | null; userMessageCount: number; tools: { name; description?; inputSchema? }[];
  toolResults: { id; name; output: unknown; isError: boolean }[] }
interface MockModelResponse { text?: string; toolCalls?: { name: string; input?: unknown; id?: string }[];
                              usage?: { inputTokens?: number; outputTokens?: number } }
```

```ts
// <fixture-app>/agent/agent.ts
import { defineAgent } from "eve";
import { mockModel } from "eve/evals";
export default defineAgent({
  model: mockModel(({ toolResults }) =>
    toolResults.length === 0 ? { toolCalls: [{ name: "get_project", input: { slug: "x" } }] } : "done"),
});
```

**Wiring a fixture agent.**

- The docs say only "use it for a dedicated fixture agent; it remains mocked whether that fixture runs locally or as a deployed eval target".
- Evals are discovered from the **app-root** `evals/` and run against **that app's** agent (a local dev server), or against `--url <url>`.
- An eval-level option that selects a different agent directory is NOT AVAILABLE.
- **INFERENCE:** a fixture is a separate eve app root with its own `agent/` (using `mockModel`) and its own `evals/`. Run `eve eval` from that directory, or start the fixture and run `eve eval --url http://127.0.0.1:<port>`.

**CLI:** `eve eval [evalId...] [--url <url>] [--tag <tag...>] [--exclude-tag <tag...>] [--strict] [--list] [--timeout <ms>] [--max-concurrency <n>] [--json] [--junit <path>] [--skip-report] [--verbose]`

- **Selecting evals:** positional ids match exactly or by directory prefix. `eve eval twin` runs `evals/twin.eval.ts` and everything under `evals/twin/`.
- **Tags:** filter with `--tag` and `--exclude-tag`. A `--tag` that matches nothing exits `2`.
- **Exit codes:** `0` pass, `1` fail, `2` config error.
- **CI:** `eve eval --strict --junit .eve/junit.xml`. Artifacts go to `.eve/evals/<timestamp>/`.
- **Remote auth:** `EVE_EVAL_AUTH_TOKEN` is the explicit bearer override for non-Vercel `--url` targets. Local targets send no auth.

---

## 11. Client (`eve/react`) and the wire protocol

**Import:** `import { useEveAgent, openConversationInputs, type EveMessagePart, type EveDynamicToolPart } from "eve/react";` and `import type { ClientSessionState, MessageStreamEvent } from "eve/client";`
**Sources:** `docs/guides/frontend/overview.mdx`, `docs/channels/eve.mdx`, `docs/concepts/sessions-runs-and-streaming.md`, `dist/src/react/use-eve-agent.d.ts`, `dist/src/client/{types,eve-agent-store-state,message-reducer-types}.d.ts`, `dist/src/protocol/{message,routes}.d.ts`, `dist/src/eve-channel/{request,index}.js` (compiled)

```tsx
"use client";
import { useEveAgent } from "eve/react";

const agent = useEveAgent({
  host: "https://twin.example.com",                // omit for same-origin /eve/v1
  auth: { bearer: async () => await getVisitorJwt() },   // re-resolved before every request
  initialSession: saved?.session,                  // { sessionId, streamIndex }
  initialEvents: saved?.events,
  resume: saved?.session !== undefined,
  onSessionChange: (s) => persist(s),              // ClientSessionState | undefined
  onEvent: (e) => log(e.type),
  prepareSend: (input) => ({ ...input, clientContext: { route: location.pathname } }),
});
await agent.send("Hi", { clientContext: "Viewing the About window" });
```

`UseEveAgentOptions<TData>`, exact:

- `agent?: string`, `auth?: ClientAuth`, `headers?: HeadersValue`, `host?: string`
- `initialEvents?: readonly MessageStreamEvent[]`, `initialSession?: ClientSessionState`
- `optimistic?: boolean` (default `true`), `followSubagents?: boolean`, `prewarm?: boolean`
- `reducer?: EveAgentReducer<TData>`, `resume?: boolean`, `session?: ClientSession`
- Callbacks: `onError?(error: Error)`, `onEvent?(event: MessageStreamEvent)`, `onFinish?(snapshot)`, `onSessionChange?(session: ClientSessionState | undefined)`, `prepareSend?: PrepareSend`

Related types:

- `ClientAuth = { bearer: TokenValue } | { basic: { username: string; password: TokenValue } } | { vercelOidc: { token: TokenValue } }`, with `TokenValue = string | (() => string | Promise<string>)`.
- `HeadersValue = Record<string,string> | (() => Record<string,string> | Promise<…>)`.
- `PrepareSend = (input: SendTurnPayload) => SendTurnPayload | Promise<SendTurnPayload>`.
- `SendTurnOptions = { turnPolicy?, clientContext?: string | string[] | JsonObject, outputSchema?, streamReconnectPolicy?, signal?, headers? }`.
- `clientContext` is ephemeral, user-role, scoped to the turn, and **never** persisted. Contrast `onMessage.context`, which is persisted.

**Returned value:**

- `data`, `conversation`, `status`, `error`, `events`, `session`
- `send(message, options?)`, `respond`, `resume`, `cancel`, `prewarm`, `reset`

**`status`:** `"ready" | "resuming" | "submitted" | "streaming" | "error"`.

**Message shapes.** `data.messages: EveMessage[]`, where `EveMessage = { id; role: "assistant" | "user"; parts: EveMessagePart[]; metadata?: { optimistic?; result?; status?: "complete"|"failed"|"streaming"|"submitted"; turnId? } }`.

```ts
// text part
{ type: "text"; text: string; id?: string; state?: "done" | "streaming"; stepIndex?: number; providerMetadata?: … }
// dynamic-tool part (union by state)
{ type: "dynamic-tool"; toolName: string; toolCallId: string; stepIndex?: number;
  toolMetadata?: { eve?: { kind: "load-skill"|"subagent-call"|"tool-call"|"unknown"; name: string; inputRequest?: …; inputResponse?: … } };
  state: "input-streaming" (input, inputText) | "input-available" (input) | "approval-requested" | "approval-responded"
       | "output-available" (input, output, partial?: true) | "output-error" (input, errorText) | "output-denied" }
// also: "reasoning", "file" { mediaType; filename?; size?; url? }, "step-start", "authorization"
```

### Stream events relevant to a proxy

| Event | `data` (exact) |
|---|---|
| `message.appended` | `{ messageDelta: string; sequence; stepIndex; turnId }`. The **delta field is `messageDelta`**. Since v25 it carries only new text. |
| `message.completed` | `{ message: string; finishReason; sequence; stepIndex; turnId }`. It **carries the full finalized block text**. Several can arrive per turn. |
| `input.requested` | `{ requests: InputRequest[]; sequence; stepIndex; taskId?; turnId }`. `InputRequest = { requestId; kind: "question"|"session-limit"|"tool-approval"; prompt; display?; options?: {id,label,description?,style?}[]; allowFreeform?; action: { kind:"tool-call"; callId; toolName; input; parentCallId? } }` |
| `turn.waiting` | `{ on: "input" \| "tasks"; sequence; turnId; usage? }`. The turn is still open. |
| `session.waiting` | `{ continuationToken: string; usage?: TokenUsage; wait: "next-user-message" }`. Ready for the next message. |
| `turn.completed` / `turn.failed` / `turn.cancelled` | `{ sequence; turnId }`. `turn.failed` also has `{ code; message; details? }`. `turn.cancelled` is always followed by `session.waiting`. |

**NDJSON format:**

- One JSON object per line: `{"type":…, "data":…, "meta":{"id":"evt_…","at":"…"}}` plus `\n`.
- Content type: `application/x-ndjson; charset=utf-8`.
- Headers: `x-eve-session-id`, `x-eve-stream-format: ndjson`, `x-eve-stream-version: 26`, and `x-eve-stream-tail-index` when requested.
- Heartbeats and leases apply **only** when the query includes `streamControlVersion=1`. Then the server sends a blank-line heartbeat every 10 s when idle. After 60 s it writes the control line `{"$eve":"stream.lease-ended","version":1}` and ends the response, and the client reconnects from its cursor. These figures come from compiled `eve-channel/request.js`. A proxy must skip blank lines and `$eve` records.

**`startIndex` on `GET /eve/v1/session/:id/stream?startIndex=N`:**

- A non-negative value is an **absolute event count**: resume at the Nth event, or `0` to rewind.
- A negative value counts from the tail: `-1` is the latest event.
- A non-integer returns 400.
- `includeTailIndex=1` adds the `x-eve-stream-tail-index` header, the index of the last durable event or `-1`. The response then ends at that tail instead of following.
- An unknown session returns 404 `{"error":"Session not found.","ok":false}`.
- Deduplicate on `meta.id`. It is stable across reconnects, but not across retried steps.

**Create a session.** `POST /eve/v1/session`, with an optional body `{ message?, clientContext?, outputSchema?, operationId? }`. The response is **202** with body `{"ok":true,"sessionId":"wrun_…","status":"accepted"}`. The ID is returned in **`body.sessionId`** and in the **`x-eve-session-id` header**. A message-free create cannot carry `clientContext` or `outputSchema`.

**Follow-up.** `POST /eve/v1/session/:id` takes `{ message }` or `{ inputResponses: [{ requestId, optionId?, text? }] }`, plus optional `clientContext`, `outputSchema` and `turnPolicy`.

- Success: 202 `{ ok, sessionId, status: "accepted", deliveryId }`.
- A 409 with `code` set to `session_not_ready` is retryable. A 409 with `session_not_active` is not.
- `meta.deliveryIds` on events identifies the turn that owns them.

**Controls:**

- `POST /eve/v1/session/:id/cancel` with optional `{ turnId }`. It returns 202 `accepted` or 200 `no_active_turn`.
- `.../compact`, `.../clear` and `.../reset` (with optional `{ reason }`).

---

## 12. Self-hosting

**Sources:** `docs/guides/deployment/self-hosting.md`, `docs/reference/cli.md`, `docs/channels/eve.mdx`, `docs/schedules.mdx`, `dist/src/protocol/routes.d.ts`, `dist/src/execution/workflow-callback-url.d.ts`

```bash
eve build [--profile <path>] [--skip-sandbox-prewarm]   # writes Nitro server to .output/ (do not deploy output built with --skip-sandbox-prewarm)
eve start [--host <host>] [--port <port>]               # --host default: all interfaces; --port default: $PORT, then 3000
PORT=3000 eve start --host 0.0.0.0
```

**What to copy into the image.** From `cli.md`: "copy the app source, `.output/`, and installed dependencies together. The deployment directory can differ from the build directory. Preserve the relative layout of any workspace packages used by the app; startup resolves sandbox prewarm modules from the deployed source."

**Persist workflow state:**

- The default local Workflow world stores runs under **`.eve/.workflow-data`**. Mount it on a persistent volume.
- Alternatively, set `experimental.workflow.world` to a package on the same `@workflow/*` `5.0.0-beta` line, with credentials passed through env.

**Environment:**

- `PORT`.
- `AI_GATEWAY_API_KEY` for string model IDs, or the provider key (for example `ANTHROPIC_API_KEY`) for a direct `LanguageModel`.
- `EVE_PUBLIC_ROUTE_PREFIX` for path-mounted agents, set at both build and run time.
- `localDev()` authenticates nothing under `eve start`.

**Proxy:**

- Forward both `/eve/` and `/.well-known/workflow/`, with paths unchanged.
- "A proxy restricted to `/eve/` lets a session start, but the run stalls when its callback can't reach eve."
- **INFERENCE:** webhook and callback base URLs come from Workflow metadata, falling back to `http://localhost:3000` (`workflow-callback-url.d.ts`). Confirm the URLs `createWebhook().url` mints are publicly reachable behind your proxy.

**Health:**

- `GET /eve/v1/health` is public and returns `{ ok: true, status: "ready", workflowId: string }`.
- `GET /eve/v1/info` uses the channel's auth.
- Verify the deployment with `eve remote connect --url https://…`.

**Schedules.** `eve start` runs Nitro's scheduled-task runner. A custom HTTP-only host does not.

**Sandbox.** The default picks Docker, then microsandbox, then just-bash, depending on availability. With `defaultTools:false` and no sandbox-backed tools, **INFERENCE:** no sandbox is needed. Verify with `eve info`.
