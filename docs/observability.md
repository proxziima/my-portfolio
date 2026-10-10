# Observability and SEO

PostHog is the single backend for product analytics, session replay, web vitals, error tracking and LLM traces. Search Console covers search. Design and decisions: [the spec](superpowers/specs/2026-10-10-observability-and-seo-design.md).

Every capture path is fire-and-forget. With a blank `POSTHOG_PROJECT_TOKEN` nothing is initialised and no request is made (dev, tests and CI run this way).

## What is captured and where

| Signal | Source | Where in the repo |
| --- | --- | --- |
| Web analytics (`$pageview`, `$pageleave`, autocapture) | posthog-js in the browser, sent through the first-party `/relay` proxy | `apps/web/lib/analytics/init.ts`, `apps/web/features/analytics/Analytics.tsx`, `apps/web/proxy.ts`, `apps/web/lib/analytics/relay.ts` |
| Custom events (catalog below) | typed `track()`, a delegated click listener, a section observer | `apps/web/lib/analytics/events.ts`, `delegated.ts`, `sections.ts`, `apps/web/features/os/apps/messenger/` |
| Web vitals | posthog-js `capture_performance: { web_vitals: true, network_timing: true }` | `apps/web/lib/analytics/init.ts` |
| Session replay | posthog-js (disabled inside the embedded `/os` iframe, the parent page records it) | `apps/web/lib/analytics/init.ts` |
| Error tracking, browser | `capture_exceptions`, `app/global-error.tsx` (reports only if posthog-js had loaded before the root layout failed), route `error.tsx` | `apps/web/app/global-error.tsx`, `apps/web/app/(site)/error.tsx` |
| Error tracking, web server | Next `onRequestError` | `apps/web/instrumentation.ts` |
| Error tracking, agents | distinct id `twin-agent`; only action outcome `failed` is reported | `apps/agents/agent/instrumentation/errors.ts`, `agent/lib/observability/errors.ts` |
| Error tracking, CMS | request errors under distinct id `cms`; MCP `ERROR` events under `mcp:payload` | `apps/payload/src/instrumentation.ts`, `apps/payload/src/mcp/observability.ts` |
| LLM traces (`$ai_generation`, `$ai_span`, `$ai_trace`) | eve OpenTelemetry integration with an export policy and an events/status redacting processor | `apps/agents/agent/instrumentation/posthog.ts`, `agent/lib/observability/` |
| Twin classifiers (`twin.gate`, `twin.intent`) | native AI SDK generations (telemetry `functionId` plus `runtimeContext`) | `apps/agents/agent/lib/abuse.ts`, `apps/agents/agent/lib/intent/classify.ts` |
| MCP spans | Payload MCP `onEvent`, server side | `apps/payload/src/mcp/observability.ts` |
| Server SDK, ids, config | shared package | `packages/observability/` |
| SEO | `robots.ts`, `sitemap.ts`, canonical and Open Graph metadata, Person JSON-LD, optional Search Console meta | `apps/web/app/robots.ts`, `apps/web/app/sitemap.ts`, `apps/web/lib/seo/json-ld.ts`, `apps/web/lib/site.ts` |

Two root layouts exist: `(site)` and `(os)`. So `app/global-not-found.tsx` (enabled with `experimental.globalNotFound`) renders unmatched URLs and `app/global-error.tsx` sits at the app root. 404s are not tracked, by design: `global-not-found` loads no analytics, and a missing page is not an error.

One failure can show up as more than one issue (the model call and the turn it failed, for example). Error Tracking groups them, so read them as one incident.

## Setup

1. Create the PostHog project. Copy its public token into `POSTHOG_PROJECT_TOKEN` for `web`, `agents` and `cms`, and set `POSTHOG_REGION` (`us` or `eu`). The compose file and `.env.deploy.example` already wire both.
2. Turn on, in the PostHog project settings:
   - Web vitals autocapture (Settings, Autocapture)
   - Exception autocapture (Settings, Error tracking)
   - Session replay, with "Mask all inputs" on
   - "Discard client IP data"
3. Search Console: add the property for `SITE_URL`, put the verification token in `GOOGLE_SITE_VERIFICATION`, then submit `<SITE_URL>/sitemap.xml`.

`SITE_URL` must be an absolute http(s) URL, and `POSTHOG_REGION` must be `us` or `eu`: the web app checks both once in `instrumentation.ts` `register()` and fails startup otherwise. Per request, the analytics helpers (`clientAnalyticsConfig`, `posthogIdsFromRequest`) never throw: a bad value that slips through switches analytics off for that request and is logged once. Unset, it falls back to `http://localhost:3000`. In compose it is mapped from `WEB_PUBLIC_URL`.

New env vars follow the `apps/agents/CLAUDE.md` rule: `agentsEnvSchema`, the `.env.example` files (the offline eval fixture lists them blank), `docker-compose.yml` and `.env.deploy.example`.

| Variable | Used by | Notes |
| --- | --- | --- |
| `POSTHOG_PROJECT_TOKEN` | web, agents, cms | Public project token. Blank disables everything. |
| `POSTHOG_REGION` | web, agents, cms | `us` (default) or `eu`. |
| `SITE_URL` | web | Absolute http(s) origin, no trailing slash. |
| `GOOGLE_SITE_VERIFICATION` | web | Optional. |

## Event catalog

| Event | Source | Properties |
| --- | --- | --- |
| `$pageview`, `$pageleave`, `$web_vitals`, `$autocapture`, `$exception` | posthog-js defaults | built in |
| `outbound_click` | delegated listener | href, host, kind (`external` or `mailto`), channel, section |
| `cta_clicked` | `[data-track]` | cta, section |
| `section_viewed` | IntersectionObserver | section |
| `role_selected` | RolePicker | role |
| `theme_changed` | WallSwitch | theme |
| `os_app_opened` | Desktop | app |
| `twin_session_started` | use-twin | resumed |
| `twin_message_sent` | use-twin | chars, turn |
| `twin_refusal` | use-twin (`refuse` helper, every refusal) | reason |
| `twin_session_renewed` | use-twin, when the chat auto-renews a dead session | none |
| `booking_opened` / `booking_completed` | BookingDialog | none |
| `$ai_generation`, `$ai_span`, `$ai_trace` | agents (OTel), Payload MCP | PostHog LLM schema |
| `mcp_request` | Payload MCP, methods other than `tools/call`, `initialize` and `notifications/*` | method, status |

Embedded `/os` (the iframe on the desk monitor) registers `embedded: true` on every event and sends no pageviews, page leaves or replay.

## Conversions

Create these PostHog actions:

- "Booked a call" = `booking_completed`
- "Emailed" = `outbound_click` where `kind = mailto`
- "Opened resume" = `os_app_opened` where `app = resume`
- "Chatted" = `twin_message_sent`

## Recommended dashboard

- Web analytics (built in)
- Trends of `section_viewed` by `section`
- Funnel: `$pageview`, `section_viewed` where section is work, `outbound_click`
- Conversions trend
- Web vitals p75 LCP, INP and CLS by `$pathname` and `$device_type`
- Error tracking issues
- LLM analytics: cost per day, p95 latency, error rate, generations by `gen_ai.agent.name`
- `$ai_span` count by `mcp_tool`

## Reading a twin trace

Open LLM analytics, Traces, and filter by person. The tree is:

`invoke_agent` > `agent.step` > `chat <model>` > `execute_tool` > `tools/call twinSearch` (the twin's client span) > the CMS's `$ai_span` for the same call.

- Identity (`distinctId`, `sessionId`, `$session_id`) is stamped on each model-call step through eve's `runtimeContext`, so every twin generation resolves to the visitor. The classifiers (`twin.gate`, `twin.intent`) are separate native generations that carry it on their own `invoke_agent` span.
- The twin's client-side `tools/call` span and the CMS's MCP span carry no identity. They join the visitor's trace by trace id.
- The CMS joins the trace through the `traceparent` the twin sends in the MCP request `_meta`. A call from another client (Claude Code, for example) is its own trace.
- On the CMS side an `$ai_span` per `tools/call` records `$ai_input_state: { keys }` and `mcp_input_keys`: argument names only, never values. mcp-handler does not expose the tool output or a tool-level `isError`, so those are read from the twin's client-side span instead.
- `$session_id` on generations links to the replay.

## Privacy

- Prompts and replies are redacted with the twin's redaction rules before export. eve's `exportPolicy` on the PostHog integration plus a redacting processor on events and status handle it; the prompt canary is scrubbed first, identity ids are allowlisted, and content is held back until the rules have loaded and whenever they are older than one hour.
- The twin chat transcript and message box carry PostHog's `ph-no-capture` class (`History.tsx`, `Conversation.tsx`), so session replay and autocapture skip them. This matters because the parent page's recorder also captures the same-origin `/os` iframe on the desk monitor.
- `/relay` strips the `cookie` header before forwarding to PostHog.
- Server-side LLM traces still flow for a visitor with Do Not Track on. They carry the agent's principal id `web:<uuid>` instead of a browser identity, because no browser PostHog id reaches the agent.
- `respect_dnt` is on, inputs are masked, and there are no identify calls (`person_profiles: 'identified_only'`).
- The switch for a consent banner is `cookieless_mode: 'on_reject'` in `apps/web/lib/analytics/init.ts`.

## Deviations from the spec

What shipped differs from [the spec](superpowers/specs/2026-10-10-observability-and-seo-design.md) in these places:

- **No `observabilityEnvSchema`.** `posthogConfig()` in `packages/observability/src/config.ts` reads and validates the env directly. The agents' `agentsEnvSchema` declares the variables, and the web app validates `POSTHOG_REGION` and `SITE_URL` at boot in `instrumentation.ts` `register()`.
- **No `SIGTERM` shutdown.** The server client uses `flushAt: 1` and `flushInterval: 0`, so each event is sent at once and a process that dies loses nothing queued. A `SIGTERM` handler would also block the default exit.
- **Redaction without `redactingProcessor`.** eve's `exportPolicy` on the PostHog integration, plus a processor that redacts span events and status messages, does the job of the spec's wrapping processor.
- **Runtime context keys.** Identity rides as `distinctId`, `sessionId` and `$session_id` in `ai.settings.context.*` (allowlisted by the processor), not `posthog.distinct_id` and `$ai_session_id` attributes. `sessionId` is the eve session (the conversation); `$session_id` is the browser's replay session.
- **Classifiers are native generations.** `twin.gate` and `twin.intent` emit their own AI SDK generations (telemetry `functionId` plus `runtimeContext`) instead of nesting inside the twin's agent span.
- **Agent errors.** They are reported under the single distinct id `twin-agent` (they are bugs for the owner, found by session id), and only action outcome `failed` counts (the spec said `failure`).
- **MCP server spans.** They record argument names only (`$ai_input_state: { keys }`) and no `$ai_output_state`: mcp-handler's `onEvent` exposes neither the tool output nor a tool-level `isError`. The twin's client-side span covers those.
- **Error pages.** `global-error.tsx` sits at the app root and unmatched URLs render `global-not-found.tsx`, because the app has two root layouts. The spec had `app/(site)/global-error.tsx`, `app/(os)/os/error.tsx` and `app/(site)/not-found.tsx`.
- **`twin_session_renewed`.** It was added during implementation for the chat's auto-renewal of a dead session.
- **Section names.** `section_viewed` and the `section` property use the section element's `id` (`section[id][aria-labelledby]`), not the `aria-labelledby` reference.

## Local testing

Set a token from a dev PostHog project in `apps/web/.env.local` and `apps/agents/.env`. The relay is at `http://localhost:3000/relay` (`http://localhost:3100/relay` in a worktree, where the web runs with `PORT=3100`).

## Verify after first deploy

The mapping of runtime-context keys happens on PostHog's servers, so it cannot be tested here. With real traces flowing, check once:

- [ ] `distinctId` on a twin generation resolves to the same person as that visitor's pageviews.
- [ ] `sessionId` shows up as `$ai_session_id`.
- [ ] `$session_id` on the generation opens the matching replay.
- [ ] A twin trace shows the full tree down to the CMS `$ai_span`, with no prompt text, no canary and no argument values.
- [ ] The twin's `tools/call` spans and the CMS spans appear inside the visitor's trace (they carry no identity and join by trace id).
- [ ] Web vitals, replay and exceptions appear (project settings above), and replays show masked inputs.
- [ ] `/relay` requests succeed in production and no cookie reaches PostHog.
- [ ] Search Console accepts the verification meta and the sitemap.
