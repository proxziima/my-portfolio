# Observability (PostHog) and SEO hygiene — design

Date: 2026-10-10 · Branch: `feat/observability` · Status: approved (owner asked for no question gates)

> **Status note:** implemented with deviations. See [Deviations from the spec](../../observability.md#deviations-from-the-spec) in `docs/observability.md`.

## Goal

One PostHog project answers four questions for the portfolio:

1. **Who visits and how they move**: traffic, channels, entry/exit pages, sections read, outbound clicks, conversions.
2. **How fast it feels**: Core Web Vitals (LCP, INP, CLS, FCP) per route and device.
3. **What breaks**: client, server, agent and MCP errors in Error Tracking, with stack traces.
4. **What the twin did**: every chat turn as an LLM trace (model calls, tool calls, MCP calls, cost, latency), joined to the same visitor and session replay as their browsing.

It also fixes the SEO gaps found in the audit. Search Console is the source of truth for search impressions; PostHog can't see them.

## Decisions (and why)

| Decision | Choice | Why |
| --- | --- | --- |
| Vendor | PostHog Cloud for analytics, replay, web vitals, error tracking and LLM analytics | Owner's choice. One tool covers every pillar, so there is no Sentry or Vercel Analytics. |
| Region | `POSTHOG_REGION=us\|eu` (default `us`), from which every host is derived | One variable instead of three hosts that can drift apart. Self-hosted PostHog is out of scope. |
| Config timing | **Runtime** env (`POSTHOG_PROJECT_TOKEN`), no `NEXT_PUBLIC_*` | The Docker image is runtime-configured (web Dockerfile l.4-5). A `NEXT_PUBLIC_` key would be frozen in at build time. Root layouts are server components on force-dynamic pages, so they read env per request and pass it to the client. |
| Disabled mode | No token means every capture is a no-op | Dev, tests and CI (which has a network guard) never send anything, and no code path branches on environment. |
| Ad-block resilience | First-party reverse proxy at `/relay/*` through `proxy.ts` (Next 16), resolved at runtime | `next.config` rewrites are frozen in at build time in standalone output. The path avoids the words "ingest" and "posthog", which blocklists match. |
| Agent tracing | eve `otelIntegration` with PostHog's official `PostHogSpanProcessor` (`@posthog/ai/otel`) | eve runs AI SDK v7 internally. PostHog's supported v7 path is OTel, and `withTracing` rejects v7 models. eve's span tree (`invoke_agent → agent.step → chat → agent.action → execute_tool`) becomes the trace hierarchy for free. |
| Agent content | Inputs and outputs **recorded**, after the twin's redaction rules and a canary scrub | The owner asked for full chat traceability. Transcripts are already stored redacted with the same rules, so PostHog holds nothing the DB doesn't. |
| Identity join | The BFF reads the visitor's PostHog cookie (`distinct_id`, session id) and forwards it in the visitor JWT. The agent stamps it on every span. | LLM traces then sit in the same person and session timeline as pageviews and replay. No identify call or PII is needed. |
| Persons | `person_profiles: 'identified_only'` | Anonymous portfolio traffic needs no person profiles, which are the costly part. |
| MCP client tracing | One OTel span per call inside `callPayloadTool`, with OTel MCP semantic-convention attributes and a `traceparent` in `_meta` | `callPayloadTool` is the single choke point. The span nests under `execute_tool` automatically. |
| MCP server tracing | `mcp.handlerOptions.onEvent` in the Payload MCP plugin emits `$ai_span` per `tools/call` (and `$exception` on error), joined to the caller's trace when `_meta.traceparent` is present | The plugin builds its `McpServer` per request inside `createMcpHandler`, so `@posthog/mcp`'s `instrument(server)` can't reach it, and that SDK is a 0.x beta that is not meant for production. `onEvent` is a stable, public hook. |
| Error tracking | posthog-js `capture_exceptions` plus error boundaries, `onRequestError` in `instrumentation.ts` (web and payload), eve lifecycle `turn.failed`/`session.failed`, and the BFF `failSafe` | These cover every place an error can surface. |
| Shared code | New package `@repo/observability` | web, payload and agents all need the same server client, cookie parsing and host derivation, so it lives in one place. |
| Consent | No banner. `respect_dnt: true`, inputs masked in replay, IP discarded in project settings (documented). | A portfolio with a cookie wall loses visitors. The init has one switch (`cookieless_mode: 'on_reject'`) if a banner is ever needed. This is a trade-off to note, not a bug. |
| Rendering strategy | Keep home `force-dynamic` | Builds must not need the CMS (runtime-configured image), and CMS reads are already cached for 5 minutes with tag revalidation, so ISR would gain little TTFB. This is documented, not changed. |
| next/image | Not adopted | The remaining `<img>` tags are tiny CMS favicons and draft-only blog images. The LCP element is text. Adopting next/image means adding `remotePatterns` for the runtime CMS host, which costs more than it returns. |

## Architecture

```
browser ──posthog-js──► /relay/* ──proxy.ts──► PostHog (region hosts)
   │  cookie ph_<token>_posthog {distinct_id, $sesid}
   ▼
web BFF /api/twin/eve/v1 ── JWT claims ph_did, ph_sid ──► agents (eve)
                                                         │ otelIntegration → redacting processor → PostHogSpanProcessor ──► PostHog ($ai_generation / $ai_span / $ai_trace)
                                                         │ callPayloadTool span + _meta.traceparent
                                                         ▼
                                                  payload /api/mcp ── onEvent → posthog-node ($ai_span, $exception)
web / payload instrumentation.ts onRequestError ── posthog-node ($exception)
```

### Unit 1: `packages/observability` (`@repo/observability`)

This package has no framework imports. Its exports:

- `./config`:
  - `posthogConfig(env = process.env)` returns `{ token, region, ingestHost, assetsHost, uiHost } | null`, or `null` when the token is blank.
  - A zod schema fragment `observabilityEnvSchema` (`POSTHOG_PROJECT_TOKEN` optional, `POSTHOG_REGION` enum, default `us`) for the apps' env schemas to merge in.
- `./cookie`: `posthogIdsFromCookie(cookieHeader, token)` returns `{ distinctId, sessionId } | null`. It parses `ph_<token>_posthog`, which is URI-encoded JSON with `distinct_id` and `$sesid: [lastActivity, sessionId, start]`. It never throws.
- `./server`:
  - `serverPostHog()` returns a lazy singleton `posthog-node` client (`flushAt: 1`, `flushInterval: 0` on long-lived Node, with `shutdown` on `SIGTERM`), or a no-op object when it is unconfigured.
  - `captureServerError(error, { distinctId?, properties? })`.

### Unit 2: web analytics (`apps/web`)

- **`lib/analytics/`** (client):
  - `init.ts`: `initPostHog(config, { embedded })`, which is idempotent. It sets:
    - `api_host: '/relay'`, `ui_host`, `defaults: '2026-05-30'`, `person_profiles: 'identified_only'`
    - `capture_exceptions: true`, `capture_performance: { web_vitals: true }`, `respect_dnt: true`
    - When `embedded` (the `/os` iframe on the desk monitor): `capture_pageview: false`, `capture_pageleave: false`, `disable_session_recording: true`, plus the super property `embedded: true`. The parent page already records that view and its replay.
  - `events.ts`: the typed event catalog, a union of names to property shapes, and `track(name, props)`, which no-ops before init.
  - `delegated.ts`: one document-level click listener.
    - `a[href]` that is external or `mailto:` sends `outbound_click { href, host, kind: 'external'|'mailto', channel: 'github'|'linkedin'|'email'|'calendar'|'other', section }`.
    - `[data-track]` sends `cta_clicked { cta, section }`.
    - `section` is the id of the closest `[aria-labelledby]` section, or `null`.
    - This one listener covers React links, the raw-HTML bio links and the OS showcase links with no per-component wiring.
  - `sections.ts`: a single `IntersectionObserver` sends `section_viewed { section }` once per section per pageview, at 50% visibility. The home page is one long page, so sections are its navigation.
- **`features/analytics/Analytics.tsx`** (client): a `'use client'` component taking `config | null` and `embedded`. It calls init and installs the listeners in one effect. Both root layouts render it with `posthogConfig()` read on the server.
- **`proxy.ts`**: matcher `/relay/:path*`. `/relay/static/*` and `/relay/array/*` are rewritten to `assetsHost`, everything else to `ingestHost`. It returns 404 when unconfigured. `next.config.js` gains `skipTrailingSlashRedirect: true`.
- **Explicit events**, the only call sites outside the delegated listener:
  - `role_selected { role }` from the role picker
  - `theme_changed { theme }` from WallSwitch
  - `os_app_opened { app }` from `Desktop.open(id)`. App `resume` is the resume conversion.
  - Twin, from `use-twin.ts`: `twin_session_started { resumed }`, `twin_message_sent { chars, turn }` (never the text, which lives in the LLM trace), `twin_refusal { reason }`, `twin_session_renewed`.
  - Booking: `booking_opened` and `booking_completed` (the Cal embed's `bookingSuccessful`).
- **`data-track`** attributes on the desk CTAs: `desk_mute`, `desk_fullscreen`, `open_desktop`.
- **Errors**:
  - The existing `error.tsx` files call `posthog.captureException(error)`.
  - New `app/(site)/global-error.tsx` and `app/(os)/os/error.tsx`.
  - `instrumentation.ts` `onRequestError` calls `captureServerError` with the distinct id from the request cookie.
  - The BFF `failSafe` calls `captureServerError` alongside its existing `console.error`.
- **Free from PostHog defaults** (no code): pageviews on client navigation, `$pageleave` with time on page and max scroll depth, referrer and `$channel_type` (organic/social/direct/referral), UTM, entry/exit paths, device, geo, bounce rate, web vitals and session replay.

### Unit 3: SEO (`apps/web`)

- **`SITE_URL` env** (runtime; compose maps it from `WEB_PUBLIC_URL`). `lib/site.ts` exports `siteUrl()` with a localhost fallback in dev.
- **Root `(site)` layout metadata:**
  - `metadataBase: new URL(siteUrl())`
  - `title: { template: '%s · <name>', default }`
  - `openGraph { type: 'website', siteName, locale: 'en_US' }`
  - `twitter { card: 'summary_large_image' }`
  - `verification.google` from `GOOGLE_SITE_VERIFICATION` when set
- **Home `generateMetadata`:** `alternates.canonical: '/'`, and `openGraph`/`twitter.images` from the CMS ogImage.
- **`app/robots.ts`:** allow `/`; disallow `/api/`, `/relay/`, `/blog/preview/`, `/os`; `sitemap: <siteUrl>/sitemap.xml`. `/os` already has `noindex`, and disallowing it saves crawl budget.
- **`app/sitemap.ts`:** `/` only, `changeFrequency: 'monthly'`, `priority: 1`. The public blog will add its own entries when it launches.
- **JSON-LD** on home: a `Person` (name, jobTitle from the default discipline, url, image from the avatar, `sameAs` from the contact links) plus a `WebSite`, as one `<script type="application/ld+json">` built by a pure function `personJsonLd(data)`.
- **Semantic fix:** `<footer>` moves outside `<main>` in `Portfolio.tsx`.
- **`app/(site)/not-found.tsx`:** a branded 404 page.
- **Preconnect:** `ReactDOM.preconnect(cmsOrigin)` in the site layout when the CMS media origin differs from the site's.

### Unit 4: agent LLM tracing (`apps/agents`)

- **`agent/instrumentation/otel.ts`:** `otel({ tracePolicy: () => ({ emit: true, recordInputs: true, recordOutputs: true }) })`. This is the OTel capture ceiling only; lifecycle providers keep their own policies. `spend.ts` is unchanged.
- **`agent/instrumentation/posthog.ts`:** `otelIntegration` with:
  - `spanProcessors: [redactingProcessor(lazyPostHogProcessor())]`
    - `lazyPostHogProcessor` builds `PostHogSpanProcessor` on first use from runtime env. It is a no-op when unconfigured, because eve evaluates modules at build time.
    - `redactingProcessor(inner)` copies each ending span's string attributes through `redactText(value, cachedRules)` and replaces the canary with `[canary]` before forwarding. It reuses the transcript's redaction (`fetchRedactionRules`, TTL-cached). Until the rules load, it holds back content attributes rather than send unredacted text.
  - `runtimeContext(input)` returns `{ distinctId, sessionId: <posthog session or eve session>, conversationId: eve session id, channel }`, with the distinct id from `input.session.auth.current.attributes.ph_did`. It falls back to the principal id (`web:<uuid>`) so traces are never anonymous-random.
  - The attribute keys follow what `@posthog/ai/otel` maps (`posthog.distinct_id`, `$ai_session_id`); the implementer confirms them against the installed package source.
- **Visitor JWT** (`apps/web/lib/twin/jwt.ts` and `upstream.ts`) gains the optional claims `ph_did` and `ph_sid`. `toVisitorPrincipal` keeps them in `attributes` next to `tz`.
- **Direct `generateText` calls** (abuse gate, intent classifier) get `telemetry: { functionId: 'twin.gate' | 'twin.intent' }` and the session runtime context, so they show up as generations in the same session.
- **`agent/instrumentation/errors.ts`:** `defineInstrumentation` on `turn.failed`, `session.failed`, `model.call.failed` and `action.failed` (outcome `failure` only). It calls `captureServerError` with the session's distinct id and `{ sessionId, turnId, kind }`. `tracePolicy` is metadata only.

### Unit 5: MCP tracing

- **Client:** `callPayloadTool` (`apps/agents/agent/lib/payload-mcp.ts`) wraps each call in a span named `tools/call <name>`. It sets:
  - Attributes: `mcp.method.name`, `gen_ai.tool.name`, `gen_ai.operation.name: 'execute_tool'`, `mcp.session.id`, `error.type` on failure.
  - The active `traceparent` in `params._meta`.
  - It uses `@opentelemetry/api` (already present through eve), so it is a no-op outside a traced context such as unit tests.
- **Server:** `apps/payload/src/mcp/observability.ts` exports `mcpOnEvent(event)`, wired as `mcp.handlerOptions.onEvent` in `mcp-plugin.ts`. On `REQUEST_COMPLETED` for `tools/call` it captures `$ai_span` with:
  - `$ai_span_name: 'mcp tools/call <tool>'`, `$ai_latency` (from `duration`, in seconds), `$ai_is_error`
  - `$ai_input_state` (the args minus `_meta`) and `$ai_output_state` (the result, truncated to 8 KB)
  - `$ai_trace_id` and `$ai_parent_id` from `_meta.traceparent` when present, or the MCP session or request id otherwise
  - `$ai_session_id` from the MCP session
  - `distinct_id: 'mcp:payload'`
  - On `ERROR` it calls `captureServerError`. Other methods (`initialize`, `tools/list`) are counted as `mcp_request { method }`.
- `apps/payload/instrumentation.ts` gets `onRequestError` → `captureServerError`.

## Event catalog (complete)

| Event | Source | Properties |
| --- | --- | --- |
| `$pageview`, `$pageleave`, `$web_vitals`, `$autocapture`, `$exception` | posthog-js defaults | built in |
| `outbound_click` | delegated listener | href, host, kind, channel, section |
| `cta_clicked` | `[data-track]` | cta, section |
| `section_viewed` | IntersectionObserver | section |
| `role_selected` | RolePicker | role |
| `theme_changed` | WallSwitch | theme |
| `os_app_opened` | Desktop | app |
| `twin_session_started` / `twin_message_sent` / `twin_refusal` / `twin_session_renewed` | use-twin | resumed / chars, turn / reason / — |
| `booking_opened` / `booking_completed` | BookingDialog | — |
| `$ai_generation`, `$ai_span`, `$ai_trace` | agents (OTel), payload MCP | PostHog LLM schema |
| `mcp_request` | payload MCP | method |

Conversions, defined as PostHog actions (documented): `booking_completed`, `outbound_click kind=mailto`, `os_app_opened app=resume`, `twin_message_sent`.

## Configuration

New env:

| Variable | Used by | Notes |
| --- | --- | --- |
| `POSTHOG_PROJECT_TOKEN` | web, agents, cms | Public project token. Blank disables everything. |
| `POSTHOG_REGION` | web, agents, cms | `us` (default) or `eu`. |
| `SITE_URL` | web | Mapped from `WEB_PUBLIC_URL` in compose. |
| `GOOGLE_SITE_VERIFICATION` | web | Optional. |

Each one is added to the env schemas (`agentsEnvSchema`, `webTwinEnvSchema` or a web-side schema), the `.env.example` files, `docker-compose.yml` and `.env.deploy.example`, following the `apps/agents/CLAUDE.md` rule. The web and agents Dockerfiles keep their telemetry-disable flags, which are for Next and eve's own telemetry, not ours.

## Error handling

- Every capture path is fire-and-forget and swallows its own errors. Observability never fails a request, a turn or an MCP call.
- `posthog-node` flushes on `SIGTERM`. eve awaits instrumentation `flush`/`shutdown`, and `lazyPostHogProcessor` forwards both.
- With no token, no network requests are made, which the tests assert.

## Testing

Unit tests use vitest in each app's existing `tests/` layout. They cover:

- `posthogConfig` host derivation and blank-token handling
- `posthogIdsFromCookie`: valid, malformed and missing cookies
- Delegated-listener classification: external, mailto, internal, `data-track`, section lookup (jsdom)
- `section_viewed` firing once per section
- `proxy.ts` routing for static, array and ingest paths, and 404 when unconfigured
- `robots.ts`, `sitemap.ts`, `personJsonLd`, home metadata canonical
- JWT claims round-trip from the BFF to `toVisitorPrincipal`
- `runtimeContext` resolver output, including the fallback
- `redactingProcessor`: redacts, scrubs the canary, and holds back content before rules load
- `callPayloadTool`: span attributes and injected `traceparent` (in-memory OTel exporter)
- `mcpOnEvent` mapping to `$ai_span`, with and without traceparent, error path, truncation
- `errors.ts` handlers

E2E (Playwright, the existing suite) adds one spec. It sets a fake token, loads `/`, and asserts:

- posthog-js requests go to `/relay/...`
- a `$pageview` is batched
- clicking a contact link queues `outbound_click`
- JSON-LD and the canonical tag are present
- `/robots.txt` and `/sitemap.xml` return 200

Final verification is a real browser run on localhost (per the owner's rule), including a chat turn, before the work is called done. Live PostHog ingestion needs the owner's token and is a documented manual step.

## Docs

`docs/observability.md` covers:

- Env setup and the PostHog project settings to toggle: web vitals autocapture, exception autocapture, replay, discard client IP
- The event catalog and the conversion actions
- A recommended dashboard (traffic and channels, sections funnel, conversions, web vitals p75 by route, errors, LLM cost/latency/error rate, MCP tool calls)
- Search Console setup
- How to read a twin trace end to end

## Out of scope

- A consent banner
- A fallback OG image generator
- ISR for home
- next/image migration
- A self-hosted PostHog
- Experiments and feature flags
- Server-side crawler logging
