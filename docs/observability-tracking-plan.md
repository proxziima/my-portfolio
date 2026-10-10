# PostHog tracking plan

The exhaustive per-signal reference for the portfolio's PostHog instrumentation, derived from the code as shipped (not from the plan). For setup, env vars, the recommended dashboard and the first-deploy checklist, read [observability.md](observability.md) first; this page is where to look up one event, trace or error.

Links read `file:line` and point at the repo root (`../` from this file). Line numbers are those of the commit that added this page; if a link drifts, search for the symbol.

## How to read this page

| Section | Covers |
| --- | --- |
| [1. Identity model](#1-identity-model) | Which `distinct_id` each signal carries |
| [2. Automatic web signals](#2-automatic-posthog-web-signals) | What posthog-js sends by itself, from its init options |
| [3. Custom web events](#3-custom-web-events) | The 12 typed events, one table each |
| [4. Conversions](#4-conversions) | Actions to define in PostHog |
| [5. LLM traces](#5-serveragent-llm-traces) | The twin's OpenTelemetry trace tree and its redaction |
| [6. MCP server](#6-mcp-server-cms) | `$ai_span` and `mcp_request` from Payload |
| [7. Error tracking](#7-error-tracking) | Every `$exception` capture site |
| [8. Infrastructure](#8-infrastructure) | `/relay`, env vars, behaviour without a token |
| [9. Verification checklist](#9-quick-verification-checklist) | Live-events filters per signal |

Every capture path is fire-and-forget and a no-op without `POSTHOG_PROJECT_TOKEN`.

## 1. Identity model

```
browser  posthog-js sets cookie ph_<token>_posthog  { distinct_id, $sesid:[last, id, start] }
   |  (same-origin request to /api/twin/...)
BFF      posthogIdsFromRequest(request)   reads the cookie, never throws
   |  mintVisitorJwt(...)  claims ph_did = distinct_id, ph_sid = session id (60 s HS256)
agent    visitorAuth keeps tz, ph_did, ph_sid  ->  traceIdentity(principal, sessionId)
   |  eve runtimeContext: distinctId, sessionId, $session_id
PostHog  generation joins the visitor's person timeline and replay
```

| Step | Code |
| --- | --- |
| Cookie parse, `MAX_ID_LENGTH = 200` bound | [cookie.ts:12](../packages/observability/src/cookie.ts#L12), [cookie.ts:22-33](../packages/observability/src/cookie.ts#L22) |
| Request helpers (null with no token, no cookie or a bad region) | [request.ts:35](../apps/web/lib/analytics/request.ts#L35), [request.ts:41](../apps/web/lib/analytics/request.ts#L41) |
| JWT claims `ph_did`, `ph_sid` (only when the cookie was readable) | [jwt.ts:25-26](../apps/web/lib/twin/jwt.ts#L25) |
| JWT minted per proxied call | [upstream.ts:19](../apps/web/lib/twin/upstream.ts#L19) |
| Agent keeps `tz`, `ph_did`, `ph_sid`, bounded by `MAX_ID_LENGTH`; principal id is `web:<visitor uuid>` | [visitor-auth.ts:9-17](../apps/agents/agent/lib/visitor-auth.ts#L9), [visitor-auth.ts:28](../apps/agents/agent/lib/visitor-auth.ts#L28) |
| Trace identity and its fallbacks | [trace-context.ts:19-24](../apps/agents/agent/lib/observability/trace-context.ts#L19) |

**Distinct id resolution on an LLM trace**, in order: `ph_did` (the browser's PostHog id) then the agent principal id `web:<uuid>` (no PostHog cookie: Do Not Track on, PostHog blocked, or an unset token on the web side) then `twin-session:<eve session id>` (no principal at all, for example `eve dev`). `sessionId` is always the eve session (the conversation, `$ai_session_id`); `$session_id` is the browser replay session, present only with `ph_sid`.

**Service ids.** Server-side signals that are not a visitor use a fixed id, so they never create fake people from visitors:

| Distinct id | Used by |
| --- | --- |
| `twin-agent` | agent errors ([errors.ts:21](../apps/agents/agent/lib/observability/errors.ts#L21)) |
| `cms` | CMS request errors ([instrumentation.ts:10](../apps/payload/src/instrumentation.ts#L10)) |
| `mcp:payload` | MCP `$ai_span`, `mcp_request` and MCP `ERROR` ([observability.ts:38](../apps/payload/src/mcp/observability.ts#L38)) |
| cookie id, or none | web server errors and BFF handler errors. With no id the server SDK assigns a random one and sets `$process_person_profile: false`, so no person is created |

`person_profiles: 'identified_only'` and no `identify` call anywhere: browser events are anonymous, and PostHog creates no person profile for them.

## 2. Automatic PostHog web signals

Initialised once per document by [initPostHog](../apps/web/lib/analytics/init.ts#L15), called from [Analytics.tsx:18](../apps/web/features/analytics/Analytics.tsx#L18), which both layouts mount ([(site)/layout.tsx:35](../apps/web/app/(site)/layout.tsx#L35), [(os)/os/layout.tsx:31](../apps/web/app/(os)/os/layout.tsx#L31)). Options, from [init.ts:18-27](../apps/web/lib/analytics/init.ts#L18):

| Option | Value | Effect |
| --- | --- | --- |
| `api_host` | `/relay` | First-party proxy, see [section 8](#8-infrastructure) |
| `ui_host` | `https://<region>.posthog.com` | Links the SDK builds (toolbar, replay) |
| `defaults` | `'2026-05-30'` | Config snapshot: `capture_pageview: 'history_change'`, `capture_pageleave: 'if_capture_pageview'`, rageclick content ignore list |
| `person_profiles` | `'identified_only'` | No person profile without `identify` |
| `capture_exceptions` | `true` | Unhandled errors and rejections become `$exception` |
| `capture_performance` | `{ web_vitals: true, network_timing: true }` | `$web_vitals` and network timing |
| `respect_dnt` | `true` | With Do Not Track on, the browser sends nothing at all |

| Signal | When | Notable properties |
| --- | --- | --- |
| `$pageview` | First load, and every History API navigation (`history_change`) | `$current_url`, `$pathname`, `$referrer`, `$device_type`, UTM and browser properties |
| `$pageleave` | Tab close or navigation away | `$prev_pageview_duration` (time on page, seconds), `$prev_pageview_max_scroll_percentage`, `$prev_pageview_last_scroll_percentage`, `$prev_pageview_max_content_percentage`, `$prev_pageview_pathname` |
| `$autocapture` | Clicks, form changes and submits on DOM elements | `$event_type`, `$el_text`, element chain. Elements inside `.ph-no-capture` are skipped |
| `$web_vitals` | Once per page, after the metrics settle | LCP, CLS, FCP and INP (posthog-js default set, `$web_vitals_<METRIC>_value`) |
| Network timing | Resource timing for `fetch` and XHR, attached to the performance events | Visible in replay's network panel |
| `$exception` | Uncaught error or unhandled rejection | `$exception_type`, `$exception_message`, `$exception_list` (stack) |
| Session replay | Whole visit | See below |

Web vitals, exception autocapture and replay also need the matching switches in the PostHog project settings ([observability.md, Setup](observability.md#setup)); the code only sets the SDK side.

**Session replay.** The code sets no recording options, so masking is the project setting: "Mask all inputs" on (`maskAllInputs`), which hides every typed value. Two extras are in code: the twin chat transcript ([History.tsx:54](../apps/web/features/os/apps/messenger/History.tsx#L54)) and the message box ([Conversation.tsx:97](../apps/web/features/os/apps/messenger/Conversation.tsx#L97)) carry `ph-no-capture`, which excludes them from replay and autocapture. That matters because the parent page's recorder also captures the same-origin `/os` iframe on the desk monitor.

**Embedded `/os` iframe.** `Analytics` passes `embedded = window.self !== window.top` ([Analytics.tsx:18](../apps/web/features/analytics/Analytics.tsx#L18)). When embedded: `capture_pageview: false`, `capture_pageleave: false`, `disable_session_recording: true` ([init.ts:26](../apps/web/lib/analytics/init.ts#L26)) and `posthog.register({ embedded: true })` ([init.ts:29](../apps/web/lib/analytics/init.ts#L29)), so every event the frame sends (custom, `$autocapture`, `$web_vitals`, `$exception`) carries `embedded: true`. Everything else stays on, and the frame shares the parent's cookie, so it is the same visitor and session. Opening `/os` directly in a tab is not embedded: full pageviews and replay. The property is only registered in the iframe, so "`embedded` is not set" selects the standalone case.

**Do Not Track.** `respect_dnt` stops all browser capture. The BFF then finds no cookie, so the agent's traces for that visitor still flow, but under `web:<uuid>` with no `ph_did` or `$session_id` ([observability.md, Privacy](observability.md#privacy)).

## 3. Custom web events

All twelve go through the typed [`track()`](../apps/web/lib/analytics/events.ts#L29), a no-op until `posthog.__loaded` (no token, tests, SSR). The catalog and property types live in [events.ts:11-24](../apps/web/lib/analytics/events.ts#L11). Wiring: [`Analytics`](../apps/web/features/analytics/Analytics.tsx) installs the delegated click listener and the section observer; the other events are called from components.

### 3.1 `outbound_click`

| | |
| --- | --- |
| Trigger | A click (mouse, touch or keyboard activation) on any `a[href]` that leaves the site: `http(s)` to another origin, or `mailto:`. Same-origin links, `tel:` and other schemes are ignored. Middle-click (`auxclick`) is not counted |
| Fired from | [delegated.ts:46](../apps/web/lib/analytics/delegated.ts#L46); classification in [delegated.ts:11-26](../apps/web/lib/analytics/delegated.ts#L11); one capture-phase document listener, [delegated.ts:48](../apps/web/lib/analytics/delegated.ts#L48) |
| Properties | `href` (string, `https://github.com/owner/repo`; the full resolved URL including query, or the whole `mailto:` address), `host` (string, `github.com`; for `mailto:` the address's domain), `kind` (`external` or `mailto`), `channel` (`github`, `linkedin`, `email`, `calendar` or `other`), `section` (string or null, `work`; id of the enclosing page section) |
| Notes | Covers React links and raw-HTML bio links with no per-component wiring. Not deduplicated: every click counts. Channel rules, first match wins on the hostname: `github.com` (and subdomains) = `github`; `linkedin.com` = `linkedin`; `cal.com` or `calendly.com` = `calendar`; any other host = `other`; `mailto:` = `email` ([delegated.ts:4-8](../apps/web/lib/analytics/delegated.ts#L4)). Fired inside the `/os` iframe too (with `embedded: true`) |
| Suggested insight | Trend by `channel`; "Emailed" conversion (`kind = mailto`); breakdown by `section` for which part of the page sends people away |

### 3.2 `cta_clicked`

| | |
| --- | --- |
| Trigger | A click on any element inside `[data-track]`; the attribute value is the CTA name |
| Fired from | [delegated.ts:42](../apps/web/lib/analytics/delegated.ts#L42) |
| Properties | `cta` (string, `open_desktop`; the `data-track` value), `section` (string or null; the enclosing `section[id][aria-labelledby]` id) |
| Notes | The same click can also fire `outbound_click` if the element is an external link. Not deduplicated. The three CTAs below are all in the desk figure, which sits outside any titled section, so `section` is `null` for them |
| Suggested insight | Trend by `cta`; funnel `$pageview` to `cta_clicked` where `cta = open_desktop` to `os_app_opened` |

`data-track` values in the codebase ([Figure.tsx](../apps/web/features/figure/Figure.tsx)):

| `cta` | Element | Line |
| --- | --- | --- |
| `desk_mute` | Mute / Unmute button on the desk video | [Figure.tsx:68](../apps/web/features/figure/Figure.tsx#L68) |
| `desk_fullscreen` | Full screen button | [Figure.tsx:73](../apps/web/features/figure/Figure.tsx#L73) |
| `open_desktop` | "Open the desktop" link to `/os` | [Figure.tsx:77](../apps/web/features/figure/Figure.tsx#L77) |

These are the only `data-track` attributes in the repo. A new CTA needs only the attribute; add it to this table.

### 3.3 `section_viewed`

| | |
| --- | --- |
| Trigger | A page section reaches 50% visibility |
| Fired from | [sections.ts:19](../apps/web/lib/analytics/sections.ts#L19); selector [sections.ts:4](../apps/web/lib/analytics/sections.ts#L4), `threshold: 0.5` [sections.ts:22](../apps/web/lib/analytics/sections.ts#L22), installed at [Analytics.tsx:20](../apps/web/features/analytics/Analytics.tsx#L20) |
| Properties | `section` (string, `projects`; the section element's `id`, not its label) |
| Notes | Once per section per page load (an in-memory set, then the element is unobserved); a reload fires again. Observes the sections present when `Analytics` mounts. Matches `section[id][aria-labelledby]`, which is what [`Section`](../apps/web/shared/ui/Section.tsx#L6) renders. Current ids: `work`, `projects`, `content` ([Portfolio.tsx:35-37](../apps/web/features/portfolio/Portfolio.tsx#L35)). Other `<section>` elements without both attributes are not tracked |
| Suggested insight | Trend by `section`; funnel `$pageview`, `section_viewed` (`section = work`), `outbound_click` |

### 3.4 `role_selected`

| | |
| --- | --- |
| Trigger | The visitor settles on a different headline role, by any input: URL hash change, digit key `1..n`, or the picker's wheel, drag and row click |
| Fired from | [use-role-analytics.ts](../apps/web/features/role/use-role-analytics.ts) (`useRoleAnalytics`), called from [RoleProvider.tsx](../apps/web/features/role/RoleProvider.tsx) |
| Properties | `role` (string, a discipline slug from the CMS) |
| Notes | Debounced: one event, with the final role, 800 ms after the last user-driven change, so a wheel spin through several roles counts once. Skipped when the settled role equals the role at the start of the interaction. Unknown slugs are ignored. Restoring the stored or hash role on load is `hydrate` (no animation), so it does not fire. Keys are ignored with a modifier held or while typing in a field. A pending event is dropped on unmount |
| Suggested insight | Breakdown by `role` of the roles people deep-link or hotkey to |

### 3.5 `theme_changed`

| | |
| --- | --- |
| Trigger | The visitor flips the wall rocker switch |
| Fired from | [WallSwitch.tsx:43](../apps/web/features/theme/WallSwitch.tsx#L43) |
| Properties | `theme` (`light` or `dark`; the theme switched **to**) |
| Notes | Not fired when the theme changes from outside (system preference, other tab). Skipped while the switch is disabled (blowout). Rapid toggles each count |
| Suggested insight | Share of `dark` versus `light` |

### 3.6 `os_app_opened`

| | |
| --- | --- |
| Trigger | The visitor opens an app in the `/os` desktop: shortcut, messenger service button, or double-clicking the messenger contact |
| Fired from | [Desktop.tsx:35](../apps/web/features/os/Desktop.tsx#L35); callers [Desktop.tsx:50](../apps/web/features/os/Desktop.tsx#L50) (shortcut), [Services.tsx:10](../apps/web/features/os/apps/messenger/Services.tsx#L10), [Messenger.tsx:35](../apps/web/features/os/apps/messenger/Messenger.tsx#L35) |
| Properties | `app` (string, `resume`): one of `showcase`, `resume`, `credits`, `doom`, `autocad`, `messenger`, `conversation` ([apps.ts:74-115](../apps/web/features/os/apps.ts#L74)) |
| Notes | The boot window (`showcase`, [apps.ts:120](../apps/web/features/os/apps.ts#L120)) is opened by `dispatch`, not by `open`, so it is not counted. Fires inside the iframe, with `embedded: true` |
| Suggested insight | Breakdown by `app`; "Opened resume" conversion (`app = resume`) |

### 3.7 `twin_session_started`

| | |
| --- | --- |
| Trigger | The twin chat hook mounts (the Conversation window opens) |
| Fired from | [use-twin.ts:68](../apps/web/features/os/apps/messenger/use-twin.ts#L68) |
| Properties | `resumed` (boolean, `true`; a saved session id was found in `localStorage` key `twin-session`) |
| Notes | Fires on every mount of the hook (the Conversation window, [Conversation.tsx:41](../apps/web/features/os/apps/messenger/Conversation.tsx#L41)), so reopening the window fires again. It marks the chat opened, not a message sent; the eve session itself is created server-side on the first message |
| Suggested insight | Chat-open rate; `resumed` split for returning chatters |

### 3.8 `twin_message_sent`

| | |
| --- | --- |
| Trigger | The visitor submits a non-empty message to the twin |
| Fired from | [use-twin.ts:159](../apps/web/features/os/apps/messenger/use-twin.ts#L159); props built in [twin-analytics.ts:5](../apps/web/features/os/apps/messenger/twin-analytics.ts#L5) |
| Properties | `chars` (number, `87`; length of the trimmed text, never the text), `turn` (number, `3`; 1-based count of the visitor's messages in this conversation) |
| Notes | Fired before the send, so a message that is then refused also shows a `twin_refusal`. A message held while the saved session resumes is counted when it is delivered ([use-twin.ts:213-218](../apps/web/features/os/apps/messenger/use-twin.ts#L213)), through `send`. The automatic resend to a renewed session is not counted again. The message text is never sent to PostHog from the browser |
| Suggested insight | "Chatted" conversion; distribution of `turn` (conversation depth) and `chars` |

### 3.9 `twin_refusal`

| | |
| --- | --- |
| Trigger | A send or stream fails and the window shows the visitor a refusal |
| Fired from | [use-twin.ts:95](../apps/web/features/os/apps/messenger/use-twin.ts#L95) (`refuse`, the one place every refusal goes through) |
| Properties | `reason` (`throttled` 429, `too_long` 413, `ended` 403, `offline` 503 or anything without an HTTP status; [limits.ts:24](../packages/twin/src/contract/limits.ts#L24)) |
| Notes | Mapped from the HTTP status in `refusalOf` ([use-twin.ts:33](../apps/web/features/os/apps/messenger/use-twin.ts#L33)). A 404 on a saved session first triggers `twin_session_renewed` instead, and only a second failure refuses |
| Suggested insight | Breakdown by `reason`; alert on a rising `offline` share |

### 3.10 `twin_session_renewed`

| | |
| --- | --- |
| Trigger | The saved session was gone (404) or failed for good, and the window starts a fresh session |
| Fired from | [use-twin.ts:115](../apps/web/features/os/apps/messenger/use-twin.ts#L115) |
| Properties | none |
| Notes | At most once per window instance (`renewed` ref), so a broken server cannot loop. Added during implementation, not in the spec |
| Suggested insight | Trend; a spike means sessions are dying server-side |

### 3.11 `booking_opened`

| | |
| --- | --- |
| Trigger | The twin's schedule tool renders the Cal.com booker in the conversation |
| Fired from | [cal-embed.ts:95](../apps/web/features/os/apps/messenger/cal-embed.ts#L95), inside `mountInline`, called by [BookingDialog.tsx:19](../apps/web/features/os/apps/messenger/BookingDialog.tsx#L19) |
| Properties | none |
| Notes | Once per mount target element (the `mounted` WeakSet); a second booker in the same chat fires again |
| Suggested insight | Funnel `twin_message_sent`, `booking_opened`, `booking_completed` |

### 3.12 `booking_completed`

| | |
| --- | --- |
| Trigger | Cal.com reports `bookingSuccessful` from the embedded booker |
| Fired from | [cal-embed.ts:94](../apps/web/features/os/apps/messenger/cal-embed.ts#L94) |
| Properties | none (no attendee, time or booking data) |
| Notes | Driven by the Cal embed's own callback, so it depends on that script loading |
| Suggested insight | "Booked a call" conversion |

## 4. Conversions

Create these as PostHog actions (they match [observability.md](observability.md#conversions)):

| Action | Definition |
| --- | --- |
| Booked a call | `booking_completed` |
| Emailed | `outbound_click` where `kind = mailto` |
| Opened resume | `os_app_opened` where `app = resume` |
| Chatted | `twin_message_sent` |

Useful secondary actions: "Went to GitHub or LinkedIn" (`outbound_click` where `channel` is `github` or `linkedin`), "Opened the desktop" (`cta_clicked` where `cta = open_desktop`).

## 5. Server/agent LLM traces

Source: eve's OpenTelemetry integration, configured in three instrumentation modules under [instrumentation/](../apps/agents/agent/instrumentation/):

| Module | Role |
| --- | --- |
| [otel.ts](../apps/agents/agent/instrumentation/otel.ts) | Process-wide capture ceiling, `functionId: 'portfolio-twin'`, records inputs and outputs ([otel.ts:9-10](../apps/agents/agent/instrumentation/otel.ts#L9)); redaction happens at export |
| [posthog.ts](../apps/agents/agent/instrumentation/posthog.ts) | `otelIntegration` to PostHog with the redacting destination and the runtime context ([posthog.ts:9-11](../apps/agents/agent/instrumentation/posthog.ts#L9)) |
| [errors.ts](../apps/agents/agent/instrumentation/errors.ts) | Error tracking, see [section 7](#7-error-tracking). Not a trace exporter |
| [spend.ts](../apps/agents/agent/instrumentation/spend.ts) | Daily spend ledger only; sends nothing to PostHog |

### 5.1 Trace tree

One turn of a twin conversation:

```
invoke_agent <agent>                       eve turn span (the trace root)
 └─ agent.step                             one model attempt; carries ai.settings.context.*
     ├─ chat <model>                       model call  ->  $ai_generation; carries ai.settings.context.*
     └─ agent.action                       one tool or action
         └─ execute_tool <tool>            eve's tool span (gen_ai.tool.*)
             └─ tools/call <tool>          the twin's MCP client span (inSpan)
                 └─ mcp tools/call <tool> the CMS's server span ($ai_span from Payload, joined by traceparent)
```

Plus, per visitor message, two classifier generations that run before and after the turn, each inside its own `invoke_agent` span: `twin.gate` and `twin.intent` ([5.4](#54-classifier-generations)).

Span names come from eve's tracing (`agent.step`, `agent.action`, `invoke_agent <name>`, `chat <model>`, `execute_tool <tool>`; checked against eve 0.71). The repo adds only the `tools/call <tool>` span ([payload-mcp.ts:27](../apps/agents/agent/lib/payload-mcp.ts#L27), tools `twinIdentity`, `twinSearch`, `twinDisclose`, [payload-mcp.ts:20](../apps/agents/agent/lib/payload-mcp.ts#L20)).

**What PostHog makes of them.** `PostHogSpanProcessor` exports only spans whose name or attribute keys start with `gen_ai.`, `llm.`, `ai.` or `traceloop.`; everything else is dropped. PostHog converts the exported OTLP spans server-side: model calls (`chat <model>`) become `$ai_generation`, other spans become `$ai_span`, and the trace is grouped by `$ai_trace_id`; the `$ai_trace` view is PostHog's. The exact server-side mapping cannot be tested in the repo, hence the [first-deploy checks](observability.md#verify-after-first-deploy).

### 5.2 Key attributes

| Attribute | On | Meaning |
| --- | --- | --- |
| `ai.settings.context.distinctId` | `agent.step`, `chat <model>`, classifier spans | PostHog distinct id, see [section 1](#1-identity-model) |
| `ai.settings.context.sessionId` | same | eve session id (the conversation); maps to `$ai_session_id` |
| `ai.settings.context.$session_id` | same, only with `ph_sid` | Browser replay session; becomes an event property that links the replay |
| `gen_ai.agent.name`, `gen_ai.operation.name` (`invoke_agent`, `chat`, `execute_tool`), `gen_ai.request.model`, `gen_ai.provider.name`, `gen_ai.usage.*`, `gen_ai.response.*` | eve spans | Standard GenAI semantic conventions |
| `gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result` | eve spans | Content: redacted before export (5.5) |
| `gen_ai.tool.name`, `gen_ai.tool.call.id` | `execute_tool` | Tool identity |
| `agent.principal.current.id`, `agent.turn.id`, `agent.run.id`, `gen_ai.conversation.id` | eve spans | Correlation ids, allow-listed in the processor |
| `mcp.method.name` (`tools/call`), `gen_ai.operation.name` (`execute_tool`), `gen_ai.tool.name`, `mcp.session.id` | `tools/call <tool>` | Set by the twin ([payload-mcp.ts:26](../apps/agents/agent/lib/payload-mcp.ts#L26), [payload-mcp.ts:34](../apps/agents/agent/lib/payload-mcp.ts#L34)); no arguments, no result |
| `error.type`, span status `ERROR`, an exception event | any `inSpan` span that threw | [spans.ts:14-17](../apps/agents/agent/lib/observability/spans.ts#L14) |

The runtime context is built by [runtimeContextOf](../apps/agents/agent/lib/observability/trace-context.ts#L32) and passed by [posthog.ts:11](../apps/agents/agent/instrumentation/posthog.ts#L11). The twin's client `tools/call` span and the CMS `$ai_span` carry no identity; they join the visitor's trace by trace id.

**Trace propagation to the CMS.** `traceMeta()` ([spans.ts:26](../apps/agents/agent/lib/observability/spans.ts#L26)) injects the active W3C `traceparent` into the MCP request `_meta` ([payload-mcp.ts:35-36](../apps/agents/agent/lib/payload-mcp.ts#L35)). Each call opens a fresh MCP connection (stateless), with a 5 s timeout ([payload-mcp.ts:8](../apps/agents/agent/lib/payload-mcp.ts#L8)). A tool result with `isError` throws a fixed-wording error (`Payload MCP <tool> failed`) so tool content never leaks into exception text ([payload-mcp.ts:37-38](../apps/agents/agent/lib/payload-mcp.ts#L37)).

### 5.3 Where the identity is computed

`traceIdentity` is called for the model spans ([posthog.ts:11](../apps/agents/agent/instrumentation/posthog.ts#L11)), the gate ([eve.ts:77](../apps/agents/agent/channels/eve.ts#L77)) and the intent classifier ([conversation.ts:43](../apps/agents/agent/hooks/conversation.ts#L43)).

### 5.4 Classifier generations

Two cheap-model calls the twin makes outside the main loop. eve registers the AI SDK OpenTelemetry integration globally, so each is already a generation; [`classifierTelemetry`](../apps/agents/agent/lib/observability/trace-context.ts#L42) names it (`functionId`) and, given an identity, attaches the runtime context with every key opted in (`includeRuntimeContext`), so the spans land as `ai.settings.context.*` in the visitor's conversation. Without an identity only the `functionId` is set.

| Generation | `functionId` | Purpose | Fired from |
| --- | --- | --- | --- |
| `twin.gate` | `twin.gate` | Abuse/scope verdict and reply depth for each incoming message (runs in the channel's `onMessage`) | [abuse.ts:80](../apps/agents/agent/lib/abuse.ts#L80) |
| `twin.intent` | `twin.intent` | Intent label for the recent turns, after a final reply | [classify.ts:76](../apps/agents/agent/lib/intent/classify.ts#L76) |

Both have `maxRetries: 0` and a timeout; a failure falls back silently (gate: `ok`, standard tier; intent: no label), so a missing generation in a conversation usually means a timeout, not a bug.

### 5.5 Redaction

Prompts, replies and tool payloads are redacted with the twin's own transcript rules before they leave the process, so PostHog holds nothing the twin's database would not. All in [processor.ts](../apps/agents/agent/lib/observability/processor.ts):

| Layer | What it does | Code |
| --- | --- | --- |
| `exportPolicy` (eve) | Every string attribute goes through the redactor; identity ids pass untouched. When rules are unavailable, eve strips its own content attributes from the span (`redact: true, inputs, outputs`) and any other attribute whose key matches `/prompt\|message\|response\|instruction\|input\|output\|args\|arguments\|result\|content\|text/i` is dropped, never sent raw | [processor.ts:70-79](../apps/agents/agent/lib/observability/processor.ts#L70), [CONTENT_KEY :15](../apps/agents/agent/lib/observability/processor.ts#L15) |
| Events and status processor | eve's policy never sees span events (exception messages, stacks) or the status message; this wraps the exporter and redacts them, or drops their strings while rules are unavailable | [processor.ts:86](../apps/agents/agent/lib/observability/processor.ts#L86) |
| Canary | The prompt canary is replaced with `[canary]` before the rules run, so overlapping redaction cannot split it | [processor.ts:37-38](../apps/agents/agent/lib/observability/processor.ts#L37) |
| Identity allowlist | These keys skip redaction (the phone-number rule would mangle UUIDs and break joins): `ai.settings.context.distinctId`, `.sessionId`, `.$session_id`, `gen_ai.conversation.id`, `agent.principal.current.id`, `agent.principal.initiator.id`, `agent.run.id`, `agent.turn.id`, `agent.parent_run.id`, `mcp.session.id`. A new id-shaped attribute is redacted until added | [processor.ts:22-34](../apps/agents/agent/lib/observability/processor.ts#L22) |
| Hold-back | The rules are fetched from the CMS (`CMS_URL`, `TWIN_REDACT_SECRET`) in the background every 10 s at most. Until the first load, and whenever the loaded rules are older than `MAX_STALE_MS` (1 hour), or the refresh failed, content is held back as above. Spans that end before the first fetch lands are held back too | [processor.ts:110](../apps/agents/agent/lib/observability/processor.ts#L110), [:122-146](../apps/agents/agent/lib/observability/processor.ts#L122), [:148](../apps/agents/agent/lib/observability/processor.ts#L148), [rules.ts:11](../packages/twin/src/redact/rules.ts#L11) |
| Disabled | With no token the processor is never built and the rules are never fetched | [processor.ts:187-198](../apps/agents/agent/lib/observability/processor.ts#L187) |

The twin's own `tools/call` span deliberately sets ids and labels only, whatever the redaction state ([payload-mcp.ts:25-26](../apps/agents/agent/lib/payload-mcp.ts#L25)).

## 6. MCP server (CMS)

Payload's MCP plugin passes every MCP event to [`mcpOnEvent`](../apps/payload/src/mcp/observability.ts#L61) ([mcp-plugin.ts:9](../apps/payload/src/mcp/mcp-plugin.ts#L9)), which never throws into the handler. Only `REQUEST_COMPLETED` events are reported ([observability.ts:37](../apps/payload/src/mcp/observability.ts#L37)); `ERROR` events go to error tracking ([section 7](#7-error-tracking)). Distinct id is always `mcp:payload`.

**Skipped** (nothing sent): `SESSION_STARTED`, `SESSION_ENDED`, `REQUEST_RECEIVED`, and the handshake methods `initialize` and `notifications/*` ([observability.ts:12](../apps/payload/src/mcp/observability.ts#L12)).

**`mcp_request`** for every other non-`tools/call` method (for example `tools/list`, `ping`): `{ method, status }` where `status` is `success` or `error` ([observability.ts:38](../apps/payload/src/mcp/observability.ts#L38)).

**`$ai_span`** for each `tools/call` ([observability.ts:43-57](../apps/payload/src/mcp/observability.ts#L43)):

| Property | Value |
| --- | --- |
| `$ai_trace_id` | The caller's trace id from `_meta.traceparent` (`00-<32 hex>-<16 hex>-<2 hex>`, [observability.ts:14](../apps/payload/src/mcp/observability.ts#L14)); otherwise `mcp-<sessionId or requestId or timestamp>`, so a non-twin client (Claude Code) gets its own trace |
| `$ai_parent_id` | The caller's span id, only when a valid `traceparent` came in; nests this span under the twin's `tools/call` span |
| `$ai_span_name` | `mcp tools/call <tool>` |
| `$ai_session_id` | MCP session id, when present |
| `$ai_latency` | Seconds (`duration` ms / 1000), when mcp-handler reports it |
| `$ai_is_error` | `status === 'error'` (the JSON-RPC status; a tool-level `isError` is not visible here) |
| `$ai_input_state` | `{ keys: [...] }`: argument **names** only, sorted ([observability.ts:17](../apps/payload/src/mcp/observability.ts#L17)) |
| `mcp_input_keys` | The same sorted names as a flat array |
| `mcp_tool` | Tool name (`unknown` if absent) |

There is no `$ai_output_state` and no argument values: mcp-handler 1.1's `onEvent` exposes neither the tool output nor a tool-level error, and values can hold visitor text that this process cannot redact. The twin's client-side span covers output and errors. The tool params are read from `result.params` because mcp-handler 1.1 emits `REQUEST_COMPLETED` without `parameters` ([observability.ts:23-26](../apps/payload/src/mcp/observability.ts#L23)).

Suggested insights: `$ai_span` count and p95 `$ai_latency` by `mcp_tool`; error rate by `$ai_is_error`.

## 7. Error tracking

All capture sites, each producing a PostHog `$exception`. Server sites use [`captureServerError`](../packages/observability/src/server.ts#L28), which never throws; the client uses `posthog.captureException`.

| Site | Distinct id | Properties | Code |
| --- | --- | --- | --- |
| Browser, uncaught errors and rejections | browser id | SDK exception properties | `capture_exceptions` [init.ts:23](../apps/web/lib/analytics/init.ts#L23) |
| Browser, `(site)` route boundary | browser id | the error | [(site)/error.tsx:9](../apps/web/app/(site)/error.tsx#L9) |
| Browser, `/os` boundary | browser id | the error | [(os)/os/error.tsx:9](../apps/web/app/(os)/os/error.tsx#L9) |
| Browser, blog preview boundary (draft mode only) | browser id | the error | [blog/error.tsx:10](../apps/web/app/(site)/blog/error.tsx#L10) |
| Browser, root layout failed | browser id, only if posthog-js had already loaded | the error | [global-error.tsx:9](../apps/web/app/global-error.tsx#L9) |
| Web server `onRequestError` | PostHog id from the request cookie, or none | `path` (query string stripped), `method`, `routePath`, `routeType` | [instrumentation.ts:20-27](../apps/web/instrumentation.ts#L20) |
| BFF `failSafe` (twin routes) | PostHog id from the request cookie, or none | `handler`: `twin.send` (POST, [route.ts:89](../apps/web/app/api/twin/eve/v1/[...path]/route.ts#L89)) or `twin.stream` (GET, [route.ts:135](../apps/web/app/api/twin/eve/v1/[...path]/route.ts#L135)) | [route.ts:63](../apps/web/app/api/twin/eve/v1/[...path]/route.ts#L63) |
| CMS `onRequestError` | `cms` | `path` (query stripped), `method`, `routePath`, `routeType` | [instrumentation.ts:10](../apps/payload/src/instrumentation.ts#L10) |
| Agent `turn.failed` | `twin-agent` | `kind: 'turn'`, `sessionId`, `turnId` | [errors.ts:12](../apps/agents/agent/instrumentation/errors.ts#L12) |
| Agent `session.failed` | `twin-agent` | `kind: 'session'`, `sessionId`, `turnId` | [errors.ts:13](../apps/agents/agent/instrumentation/errors.ts#L13) |
| Agent `model.call.failed` | `twin-agent` | `kind: 'model'`, `sessionId`, `turnId` | [errors.ts:14](../apps/agents/agent/instrumentation/errors.ts#L14) |
| Agent `action.failed` | `twin-agent` | `kind: 'action'`, `sessionId`, `turnId`; **only when `outcome === 'failed'`** (rejections, cancellations and abandons are normal flow) | [errors.ts:15](../apps/agents/agent/instrumentation/errors.ts#L15), [errors.ts:19](../apps/agents/agent/lib/observability/errors.ts#L19) |
| MCP `ERROR` event | `mcp:payload` | `source`, `severity`, `context` | [observability.ts:64-68](../apps/payload/src/mcp/observability.ts#L64) |

Notes:

- Agent reports go through [reportAgentFailure](../apps/agents/agent/lib/observability/errors.ts#L18); a non-`Error` value is wrapped as `new Error(String(...))`. They are bugs for the owner, found by `sessionId`, which is why they share one id. The module records outputs only because error details are an output; it reads no prompts ([errors.ts:10](../apps/agents/agent/instrumentation/errors.ts#L10)), and flushes on shutdown ([errors.ts:17](../apps/agents/agent/instrumentation/errors.ts#L17)).
- One failure can surface as several issues (the model call and the turn it killed). Different exception types stay separate issues; read them together by `sessionId`.
- The `path` is sent without its query string, which can carry secrets such as `/api/preview?previewSecret=...`.
- A failed twin send reaches the visitor as the `offline` refusal; the BFF `$exception` is the server-side cause, and the browser's `twin_refusal` with `reason = offline` is the visitor-side effect.
- Unmatched URLs (404) are not tracked: `global-not-found` loads no analytics and a missing page is not an error.

## 8. Infrastructure

**`/relay` proxy.** posthog-js sends to `/relay` on the site's own origin ([init.ts:19](../apps/web/lib/analytics/init.ts#L19)), which avoids ad-blocker word lists. [`proxy.ts`](../apps/web/proxy.ts) (matcher `/relay/:path*`, [proxy.ts:19](../apps/web/proxy.ts#L19)) resolves the target per request, so the region is runtime config:

| Request path | Forwarded to |
| --- | --- |
| `/relay/static/*`, `/relay/array/*` | `https://<region>-assets.i.posthog.com` (SDK assets, remote config) |
| anything else under `/relay/` | `https://<region>.i.posthog.com` (ingestion) |

Routing is in [relay.ts:10-14](../apps/web/lib/analytics/relay.ts#L10). The proxy sets `host` to the target and **deletes the `cookie` header** ([proxy.ts:15](../apps/web/proxy.ts#L15)) so the site's own cookies (for example the signed visitor id) never reach PostHog. With no token configured, or a path outside `/relay/`, it answers 404 ([proxy.ts:11](../apps/web/proxy.ts#L11)).

**Server SDK.** [`serverPostHog()`](../packages/observability/src/server.ts#L20) is built on first use (never at import, since builds have no env) with `flushAt: 1, flushInterval: 0` ([server.ts:23](../packages/observability/src/server.ts#L23)): each event is sent at once, so a process that dies loses nothing queued, and no `SIGTERM` handler is needed.

**Env vars** (read at runtime by [posthogConfig](../packages/observability/src/config.ts#L25)):

| Variable | Used by | Notes |
| --- | --- | --- |
| `POSTHOG_PROJECT_TOKEN` | web, agents, cms | Public token. Blank disables everything |
| `POSTHOG_REGION` | web, agents, cms | `us` (default) or `eu`; anything else throws ([config.ts:29](../packages/observability/src/config.ts#L29)). Derives `ingestHost`, `assetsHost`, `uiHost` ([config.ts:33-35](../packages/observability/src/config.ts#L33)) |
| `SITE_URL` | web | Validated at boot together with the region ([instrumentation.ts:8-18](../apps/web/instrumentation.ts#L8)) |
| `CMS_URL`, `TWIN_REDACT_SECRET`, `TWIN_PROMPT_CANARY` | agents | Feed the redactor ([processor.ts:127-131](../apps/agents/agent/lib/observability/processor.ts#L127)) |

**Without a token.** `posthogConfig()` returns `null`: `clientAnalyticsConfig()` is `null` so [`Analytics`](../apps/web/features/analytics/Analytics.tsx#L16) does nothing and `track()` is a no-op; the server SDK is a no-op client ([server.ts:11](../packages/observability/src/server.ts#L11)); the agent's span processor is never built and the redaction rules are never fetched; the MCP capture and error calls reach the no-op client; `/relay` answers 404. Dev, tests and CI run this way. A bad region throws at web boot; per request the web helpers instead switch analytics off for that request and log once ([request.ts:19](../apps/web/lib/analytics/request.ts#L19)).

## 9. Quick verification checklist

Open PostHog, Activity, Live events, with a token set in a dev project ([observability.md, Local testing](observability.md#local-testing)). Do the action, then check the event and its properties.

| Signal | Do this | Expect in Live events |
| --- | --- | --- |
| `$pageview` | Load `/`, then navigate | One per navigation, `$pathname` set |
| `$pageleave` | Close the tab or navigate | `$prev_pageview_duration`, `$prev_pageview_max_scroll_percentage` |
| `$web_vitals` | Load and interact, then leave | `$web_vitals_LCP_value`, INP, CLS, FCP |
| Replay | Visit, type in a field | A recording with the input masked; the twin transcript and box blank |
| `section_viewed` | Scroll to the bottom | One each for `work`, `projects`, `content` |
| `outbound_click` | Click GitHub, LinkedIn, an email link | `channel` = `github`, `linkedin`, `email`; `kind` = `mailto` for email |
| `cta_clicked` | Mute, full screen, "Open the desktop" | `cta` = `desk_mute`, `desk_fullscreen`, `open_desktop`; `section` null |
| `role_selected` | Press `2`, change the URL hash, or spin the picker and stop | `role` = the slug, once, about 800 ms after you stop |
| `theme_changed` | Flip the wall switch | `theme` = the new value |
| `os_app_opened` | Open an app on `/os` | `app` = its id; in the iframe, `embedded = true` |
| `twin_session_started` | Open the conversation | `resumed` false, then true after a reload |
| `twin_message_sent` | Send a message | `chars`, `turn`; no text |
| `twin_refusal` | Exceed a limit, or stop the agent | `reason` = `throttled`, `too_long`, `ended`, `offline` |
| `twin_session_renewed` | Clear the server session, then send | Fires once |
| `booking_opened`, `booking_completed` | Ask the twin to schedule, book in the booker | One each, no properties |
| `$ai_generation` | After a twin reply, LLM analytics, Traces | `chat <model>` generations plus `twin.gate` and `twin.intent`; `distinctId` equals the visitor's; no prompt text, no canary |
| MCP `$ai_span` | A twin turn that searches | `$ai_span` with `mcp_tool` `twinSearch`, `$ai_trace_id` equal to the turn's trace, `$ai_parent_id` set, `mcp_input_keys` names only |
| `mcp_request` | Call `tools/list` from an MCP client | `method`, `status`; none for `initialize` or `notifications/*` |
| `$exception` (agent) | Force a turn failure | distinct id `twin-agent`, `kind`, `sessionId` |
| `$exception` (web server, CMS) | Throw in a route / the CMS | `path` with no query; distinct id the visitor's or `cms` |
| `$exception` (MCP) | Provoke an MCP error | distinct id `mcp:payload`, `source`, `severity` |
| `/relay` | Network tab | `/relay/e/` and `/relay/static/...` succeed; no `cookie` header reaches PostHog |
