# Observability and SEO

PostHog is the single backend for product analytics, session replay, web vitals, error tracking and LLM traces. Search Console covers search. Design and decisions: [the spec](superpowers/specs/2026-10-10-observability-and-seo-design.md).

For every event, trace and error with its trigger, source line and properties, see the [tracking plan](observability-tracking-plan.md).

Every capture path is fire-and-forget. With a blank `POSTHOG_PROJECT_TOKEN` nothing is initialised and no request is made (dev, tests and CI run this way).

## What is captured and where

| Signal | Source | Where in the repo |
| --- | --- | --- |
| Web analytics (`$pageview`, `$pageleave`, autocapture) | posthog-js in the browser, sent through the first-party `/relay` proxy | `apps/web/lib/analytics/init.ts`, `apps/web/features/analytics/Analytics.tsx`, `apps/web/proxy.ts`, `apps/web/lib/analytics/relay.ts` |
| Custom events (catalog below) | typed `track()`, a delegated click listener, a section observer | `apps/web/lib/analytics/events.ts`, `delegated.ts`, `sections.ts`, `apps/web/features/os/apps/messenger/` |
| Engaged time (`section_engaged`, `os_engaged`) | an idle-aware clock per section and on the OS, reported on page hide or unload with `trackOnExit()` (beacon) | `apps/web/lib/analytics/engagement.ts`, `section-engagement.ts`, `os-engagement.ts` |
| Experience load time and failures (`experience_ready`, `experience_failed`) | one settle-once timer per heavy experience: desk scene, OS boot, DOS apps, twin first reply | `apps/web/lib/analytics/experience.ts`, `use-experience.ts` |
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

One failure can show up as more than one issue (the model call and the turn it failed, for example). Different exception types stay separate issues, so read them together by `sessionId`.

## Setup

1. Create the PostHog project. Copy its public token into `POSTHOG_PROJECT_TOKEN` for `web`, `agents` and `cms`, and set `POSTHOG_REGION` (`us` or `eu`). The compose file and `.env.deploy.example` already wire both.
2. Turn on, in the PostHog project settings:
   - Web vitals autocapture (Settings, Autocapture)
   - Exception autocapture (Settings, Error tracking)
   - Session replay, with "Mask all inputs" on
   - "Discard client IP data"
3. Search Console: add the property for `SITE_URL`, put the verification token in `GOOGLE_SITE_VERIFICATION`, then submit `<SITE_URL>/sitemap.xml`.

`SITE_URL` must be an absolute http(s) URL, and `POSTHOG_REGION` must be `us` or `eu`: the web app checks both once in `instrumentation.ts` `register()` and fails startup otherwise. Per request, the analytics helpers (`clientAnalyticsConfig`, `posthogIdsFromRequest`) never throw: a bad value that slips through switches analytics off for that request and is logged once. An unset `SITE_URL` falls back to `http://localhost:3000`. In compose it is mapped from `WEB_PUBLIC_URL`.

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
| `section_engaged` | section engagement clocks, on page hide or unload | section, seconds |
| `role_selected` | RolePicker | role |
| `theme_changed` | WallSwitch | theme |
| `os_app_opened` | Desktop | app |
| `os_engaged` | OS engagement clock, on page hide or unload | seconds, embedded, apps_opened |
| `twin_session_started` | use-twin | resumed |
| `twin_message_sent` | use-twin | chars, turn |
| `twin_refusal` | use-twin (`refuse` helper, every refusal) | reason |
| `twin_session_renewed` | use-twin, when the chat auto-renews a dead session | none |
| `booking_opened` / `booking_completed` | BookingDialog | none |
| `experience_ready` | Figure/DeskScene, Desktop, DosPlayer, use-twin | experience (`desk_scene`, `os_boot`, `dos_app`, `twin_first_reply`), ms, app (DOS only), host (`desk_scene` only: `worker` or `main`) |
| `experience_failed` | the same, plus the OS window boundary (AppBoundary) | experience (the above, plus `os_app`), reason (`webgl_unavailable`, `load_error`, `context_lost`, `run_error`, `timeout`, the refusal kind, or for `os_app` `chunk_load_error` / `render_error`), app (DOS and OS apps), host (`desk_scene` only) |
| `$ai_generation`, `$ai_span`, `$ai_trace` | agents (OTel), Payload MCP | PostHog LLM schema |
| `mcp_request` | Payload MCP, methods other than `tools/call`, `initialize` and `notifications/*` | method, status |

Embedded `/os` (the iframe on the desk monitor) registers `embedded: true` on every event and sends no pageviews, page leaves or replay.

**Engaged time.** `section_engaged` and `os_engaged` count only time that is on screen (section half visible, or OS document visible) with visitor input in the last 30 s, GA4-style. They are sent when the page hides or unloads and the clocks then reset, so sum `seconds` per session. The home page's `$pageleave` duration is wall clock and includes the time spent in the OS on the desk monitor; use these two events to split the 2D page from the OS. Details and insights in the [tracking plan](observability-tracking-plan.md#34-section_engaged).

**Experience load time.** Each heavy experience is timed once per mount and reports either `experience_ready` (whole milliseconds since its start) or `experience_failed` (a short machine `reason`, never error text), never both: the desk scene from the near-viewport mount to its first frame, the OS from Desktop mount to the first desktop (reboots are not timed), a DOS app from its window opening to js-dos running the bundle, the twin from a sent message to its first new text (60 s timeout). An experience left before it settles (window closed, page left) reports nothing. Details in the [tracking plan](observability-tracking-plan.md#315-experience_ready-and-experience_failed).

## Conversions

Create these PostHog actions:

- "Booked a call" = `booking_completed`
- "Emailed" = `outbound_click` where `kind = mailto`
- "Opened resume" = `os_app_opened` where `app = resume`
- "Chatted" = `twin_message_sent`

## Recommended dashboard

- Web analytics (built in)
- Trends of `section_viewed` by `section`
- Average engaged seconds per section: sum of `section_engaged.seconds` by `section` / unique sessions
- 2D versus OS: per session, sum of `section_engaged.seconds` against `os_engaged.seconds`, broken down by `embedded` and `$device_type`
- Funnel: `$pageview`, `section_viewed` where section is work, `outbound_click`
- Conversions trend
- Web vitals p75 LCP, INP and CLS by `$pathname` and `$device_type`
- Experience load time: p50 and p95 of `experience_ready.ms` by `experience` (and by `app` for `dos_app`), broken down by `$device_type` and `$browser`
- Experience failure rate: `experience_failed` / (`experience_ready` + `experience_failed`) by `experience`, with `experience_failed` broken down by `reason`
- Error tracking issues
- LLM analytics: cost per day, p95 latency, error rate, generations by `gen_ai.agent.name`
- `$ai_span` count by `mcp_tool`

## Performance budgets

The `lighthouse` job in `.github/workflows/ci.yml` runs on every PR and push, after `checks`. It needs no secret: it builds and seeds a throwaway CMS in the runner (SQLite under `apps/payload/.tmp`, never `payload.db`), builds the web app, and starts the standalone server the Docker image runs. Then:

1. `scripts/perf/chunks.ts` asserts what the letter and the OS load up front (no posthog, three, eve or zod; initial JS within budget).
2. `scripts/perf/lighthouse.ts --runs 5 --calibrate --lhci` measures the letter five times per form factor with Lighthouse 13.5.0, the version every phase checkpoint used. `--calibrate` scales the CPU slowdown by the runner's benchmark index (`environment.benchmarkIndex`) over PageSpeed's (about 1250), so a fast or slow runner type is measured as PageSpeed's hardware class; without it, TBT moved with whichever machine GitHub assigned.
3. `lhci assert` checks `apps/web/lighthouserc.mobile.json` and `lighthouserc.desktop.json` against the **median** of the five runs, each assertion on its own (`aggregationMethod: median`), so one noisy run cannot fail the job.
4. The `lighthouse` artifact holds every report (`<form>-<n>.json`, open them in the [Lighthouse viewer](https://googlechrome.github.io/lighthouse/viewer/)), `summary.json` and `<form>/.lighthouseci/assertion-results.json`.

| Budget | Mobile | Desktop | Measured, mobile / desktop |
|---|---|---|---|
| Performance score | ≥ 0.75 | ≥ 0.9 | 82 / 100 |
| Accessibility, best practices, SEO | 1 | 1 | 100 / 100 / 100 |
| CLS | ≤ 0.05 | ≤ 0.05 | 0.000 / 0.000 (the real-throttling recorder: 0.0017 at 412 px, 0.045 at 1350 px) |
| TBT | ≤ 650 ms | ≤ 150 ms | 520 ms / 43 ms |
| Total bytes | ≤ 1.6 MB | ≤ 1.6 MB | 1.03 MB |
| Script transfer | ≤ 460 KB | ≤ 460 KB | 342 KB |

Measured: the job's exact procedure run locally at the end of Phase 3 (five calibrated runs each, against the seeded throwaway CMS; mobile runs 82 to 84, TBT 469 to 528 ms). Every assertion is an error: a budget that only warns gets ignored. The score floors sit under the measured medians by more than a run's spread; PageSpeed's ≥ 90 target is checked on production at each checkpoint, not here. TBT is median + 25 % (mobile) and the Phase 3 target (desktop). CLS (owner's decision: 0.05) and the byte budgets are never relaxed. These numbers come from a workstation calibrated to PageSpeed's class, not from a GitHub runner: after the job's first three runs, re-derive the TBT budget from their medians as below.

**Updating a budget.** A budget changes in the PR that changes what it measures, with the numbers in the PR description:

- Tighter, after an improvement: take the medians of three CI runs of the PR (re-run the job), set the new budget at median + 25 % for TBT, at the median minus five points (rounded down to 0.05) for a score floor, and with about 10 % headroom for bytes. Tightening is always fine.
- Looser, for a real feature cost: same evidence, plus a line in the PR saying what the visitor gets for it. Never for CLS or the bytes without the owner's sign-off.
- After bumping Lighthouse (`LIGHTHOUSE` in `scripts/perf/lighthouse.ts`) or `PSI_BENCHMARK`, re-measure the baseline and every budget in the same PR: scores move between Lighthouse versions.
- Reproduce a CI run locally: production build plus CMS (see `scripts/perf/lighthouse.ts`), then `node scripts/perf/lighthouse.ts --serve --runs 5 --calibrate --lhci --out .perf/ci`, then from `apps/web/.perf/ci/mobile`: `bunx @lhci/cli@0.15.1 assert --config=../../../lighthouserc.mobile.json` (and the same for desktop).

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
