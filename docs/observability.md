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
| Error tracking, browser | `capture_exceptions`, `app/global-error.tsx`, route `error.tsx` | `apps/web/app/global-error.tsx`, `apps/web/app/(site)/error.tsx` |
| Error tracking, web server | Next `onRequestError` | `apps/web/instrumentation.ts` |
| Error tracking, agents | distinct id `twin-agent`; only action outcome `failed` is reported | `apps/agents/agent/instrumentation/errors.ts`, `agent/lib/observability/errors.ts` |
| Error tracking, CMS | request errors under distinct id `cms` | `apps/payload/src/instrumentation.ts` |
| LLM traces (`$ai_generation`, `$ai_span`, `$ai_trace`) | eve OpenTelemetry integration with an export policy and a redacting processor | `apps/agents/agent/instrumentation/posthog.ts`, `agent/lib/observability/` |
| Twin classifiers (`twin.gate`, `twin.intent`) | native AI SDK generations (telemetry `functionId` plus `runtimeContext`) | `apps/agents/agent/lib/abuse.ts`, `apps/agents/agent/lib/intent/classify.ts` |
| MCP spans | Payload MCP `onEvent`, server side | `apps/payload/src/mcp/observability.ts` |
| Server SDK, ids, config | shared package | `packages/observability/` |
| SEO | `robots.ts`, `sitemap.ts`, canonical and Open Graph metadata, Person JSON-LD, optional Search Console meta | `apps/web/app/robots.ts`, `apps/web/app/sitemap.ts`, `apps/web/lib/seo/json-ld.ts`, `apps/web/lib/site.ts` |

Two root layouts exist: `(site)` and `(os)`. So `app/global-not-found.tsx` (enabled with `experimental.globalNotFound`) renders unmatched URLs and `app/global-error.tsx` sits at the app root.

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
| `mcp_request` | Payload MCP, methods other than `tools/call` | method, status |

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

- The twin carries the visitor's PostHog identity on the parent `invoke_agent` span. The classifiers (`twin.gate`, `twin.intent`) are separate native generations.
- The CMS joins the trace through the `traceparent` the twin sends in the MCP request `_meta`. A call from another client (Claude Code, for example) is its own trace.
- On the CMS side an `$ai_span` per `tools/call` records `$ai_input_state: { keys }` and `mcp_input_keys`: argument names only, never values. mcp-handler does not expose the tool output or a tool-level `isError`, so those are read from the twin's client-side span instead.
- `$session_id` on generations links to the replay.

## Privacy

- Prompts and replies are redacted with the twin's redaction rules before export. eve's `exportPolicy` on the PostHog integration plus a redacting processor on events and status handle it; the prompt canary is scrubbed first, identity ids are allowlisted, and content is held back until the rules have loaded and whenever they are older than one hour.
- The twin chat transcript and message box carry PostHog's `ph-no-capture` class (`History.tsx`, `Conversation.tsx`), so session replay and autocapture skip them. This matters because the parent page's recorder also captures the same-origin `/os` iframe on the desk monitor.
- `/relay` strips the `cookie` header before forwarding to PostHog.
- `respect_dnt` is on, inputs are masked, and there are no identify calls (`person_profiles: 'identified_only'`).
- The switch for a consent banner is `cookieless_mode: 'on_reject'` in `apps/web/lib/analytics/init.ts`.

## Local testing

Set a token from a dev PostHog project in `apps/web/.env.local` and `apps/agents/.env`. The relay is at `http://localhost:3000/relay` (`http://localhost:3100/relay` in a worktree, where the web runs with `PORT=3100`).

## Verify after first deploy

The mapping of runtime-context keys happens on PostHog's servers, so it cannot be tested here. With real traces flowing, check once:

- [ ] `distinctId` on a twin generation resolves to the same person as that visitor's pageviews.
- [ ] `sessionId` shows up as `$ai_session_id`.
- [ ] `$session_id` on the generation opens the matching replay.
- [ ] A twin trace shows the full tree down to the CMS `$ai_span`, with no prompt text, no canary and no argument values.
- [ ] Web vitals, replay and exceptions appear (project settings above), and replays show masked inputs.
- [ ] `/relay` requests succeed in production and no cookie reaches PostHog.
- [ ] Search Console accepts the verification meta and the sitemap.
