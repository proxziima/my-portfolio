# Observability (PostHog) and SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument the portfolio with PostHog (web analytics, web vitals, replay, error tracking, LLM traces of the twin agent, MCP traces) and close the SEO gaps (metadataBase, canonical, robots, sitemap, JSON-LD, semantic footer, 404).

**Architecture:** A framework-free workspace package `@repo/observability` holds config, cookie parsing and the server client. The web app inits posthog-js from runtime env passed by its server layouts, proxies ingestion through `proxy.ts` at `/relay`, and forwards the visitor's PostHog ids to the agent in the visitor JWT. The agent exports eve's OTel spans to PostHog through `PostHogSpanProcessor` behind a redacting processor. Payload's MCP plugin reports tool calls through `mcp-handler`'s `onEvent` hook.

**Tech Stack:** Next.js 16.3 (App Router, `proxy.ts`), React 19, posthog-js 1.438.7, posthog-node 5.55.1, @posthog/ai 8.13.5 (`/otel`), eve 0.71 (`eve/instrumentation`, `eve/instrumentation/otel`), AI SDK 7, @opentelemetry/api 1.9.1, @modelcontextprotocol/sdk 1.32, Payload 3.90 (`@payloadcms/plugin-mcp`), vitest 5, Playwright, bun 1.3.10.

**Spec:** `docs/superpowers/specs/2026-10-10-observability-and-seo-design.md`.

**Repo rules for every task:**
- Run commands from the worktree root `D:/Second Brain/01.PROJETOS/applications/my-portfolio/.claude/worktrees/feat-observability` unless a step says otherwise.
- Git: one git command per Bash call. No compound commands mentioning git (`&&`, `;`, `|`).
- Never touch `apps/payload/payload.db`. Never reset a database.
- ESLint ignores TS here; `check-types` and tests are the gate.
- Match surrounding style: 2-space indent, single quotes, no semicolons, JSDoc one-liners explaining *why*.
- Tests must never hit the network. agents and twin have a network guard; web tests mock `fetch`.

---

## File map

**Create**
- `packages/observability/package.json`, `tsconfig.json`, `vitest.config.ts`
- `packages/observability/src/config.ts`: `posthogConfig()` and region → hosts
- `packages/observability/src/cookie.ts`: `posthogIdsFromCookie()`
- `packages/observability/src/server.ts`: `serverPostHog()`, `captureServerError()`
- `packages/observability/tests/{config,cookie,server}.test.ts`
- `apps/web/lib/analytics/init.ts`: client init (idempotent, embedded-aware)
- `apps/web/lib/analytics/events.ts`: typed catalog and `track()`
- `apps/web/lib/analytics/delegated.ts`: outbound and `data-track` click listener
- `apps/web/lib/analytics/sections.ts`: `section_viewed` observer
- `apps/web/lib/analytics/request.ts`: server-side `posthogIdsFromRequest()` and `clientAnalyticsConfig()`
- `apps/web/features/analytics/Analytics.tsx`: the client component the layouts render
- `apps/web/proxy.ts` and `apps/web/lib/analytics/relay.ts`: the `/relay` reverse proxy
- `apps/web/instrumentation.ts`: `onRequestError`
- `apps/web/app/(site)/global-error.tsx`, `apps/web/app/(site)/not-found.tsx`, `apps/web/app/(os)/os/error.tsx`
- `apps/web/lib/site.ts`, `apps/web/lib/seo/json-ld.ts`, `apps/web/app/robots.ts`, `apps/web/app/sitemap.ts`
- `apps/web/tests/unit/analytics/*.test.ts`, `apps/web/tests/unit/seo/*.test.ts`, `apps/web/tests/e2e/analytics.spec.ts`
- `apps/agents/agent/lib/observability/trace-context.ts`: identity, runtime context, span attributes
- `apps/agents/agent/lib/observability/processor.ts`: lazy and redacting span processors
- `apps/agents/agent/lib/observability/spans.ts`: `inSpan()`, `traceMeta()`, `generationSpan()`
- `apps/agents/agent/instrumentation/otel.ts`, `posthog.ts`, `errors.ts`
- `apps/agents/tests/observability-*.test.ts`
- `apps/payload/src/mcp/observability.ts`, `apps/payload/src/instrumentation.ts`, `apps/payload/tests/int/mcp-observability.int.spec.ts`
- `docs/observability.md`

**Modify**
- `apps/web/next.config.js`: `transpilePackages`, `skipTrailingSlashRedirect`
- `apps/web/app/(site)/layout.tsx`, `apps/web/app/(os)/os/layout.tsx`, `apps/web/app/(site)/page.tsx`, `apps/web/app/(site)/error.tsx`
- `apps/web/features/portfolio/Portfolio.tsx`: footer outside `<main>`
- `apps/web/features/figure/Figure.tsx`: `data-track` on the CTAs
- `apps/web/features/role/RoleProvider.tsx`, `apps/web/features/theme/WallSwitch.tsx`, `apps/web/features/os/Desktop.tsx`, `apps/web/features/os/apps/messenger/use-twin.ts`, `apps/web/features/os/apps/messenger/cal-embed.ts`
- `apps/web/lib/twin/jwt.ts`, `apps/web/lib/twin/upstream.ts`, `apps/web/app/api/twin/eve/v1/[...path]/route.ts`
- `apps/agents/agent/lib/visitor-auth.ts`, `apps/agents/agent/lib/payload-mcp.ts`, `apps/agents/agent/lib/abuse.ts`, `apps/agents/agent/lib/intent/classify.ts`, `apps/agents/agent/lib/intent/evaluate.ts`, `apps/agents/agent/channels/eve.ts`, `apps/agents/agent/hooks/conversation.ts`
- `packages/twin/src/env.ts`: optional `POSTHOG_*` in `agentsEnvSchema`
- `apps/payload/src/mcp/mcp-plugin.ts`, `apps/payload/next.config.ts`
- `.env` examples, `docker-compose.yml`, `.env.deploy.example`, `apps/*/package.json`

---

### Task 1: `@repo/observability` package (config, cookie, server client)

**Files:**
- Create: `packages/observability/package.json`, `packages/observability/tsconfig.json`, `packages/observability/vitest.config.ts`
- Create: `packages/observability/src/config.ts`, `src/cookie.ts`, `src/server.ts`
- Test: `packages/observability/tests/config.test.ts`, `cookie.test.ts`, `server.test.ts`

This package has no zod, because Payload pins zod 3 and the rest use zod 4.

- [ ] **Step 1: Scaffold the package**

`packages/observability/package.json`:

```json
{
  "name": "@repo/observability",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./config": "./src/config.ts",
    "./cookie": "./src/cookie.ts",
    "./server": "./src/server.ts"
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "posthog-node": "5.55.1"
  },
  "devDependencies": {
    "@repo/typescript-config": "*",
    "@types/node": "24.x",
    "typescript": "7.0.2",
    "vitest": "5.0.3"
  }
}
```

`packages/observability/tsconfig.json`:

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "declaration": false,
    "declarationMap": false,
    "types": ["node"]
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

`packages/observability/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
})
```

Run: `bun install`
Expected: installs `posthog-node@5.55.1` and links `@repo/observability`.

- [ ] **Step 2: Write the failing config test**

`packages/observability/tests/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { posthogConfig } from '../src/config'

describe('posthogConfig', () => {
  it('is null without a token, or with a blank one', () => {
    expect(posthogConfig({})).toBeNull()
    expect(posthogConfig({ POSTHOG_PROJECT_TOKEN: '   ' })).toBeNull()
  })

  it('defaults to the US region and derives every host from it', () => {
    expect(posthogConfig({ POSTHOG_PROJECT_TOKEN: 'phc_x' })).toEqual({
      token: 'phc_x',
      region: 'us',
      ingestHost: 'https://us.i.posthog.com',
      assetsHost: 'https://us-assets.i.posthog.com',
      uiHost: 'https://us.posthog.com',
    })
  })

  it('derives the EU hosts', () => {
    expect(posthogConfig({ POSTHOG_PROJECT_TOKEN: 'phc_x', POSTHOG_REGION: 'eu' })).toMatchObject({
      region: 'eu',
      ingestHost: 'https://eu.i.posthog.com',
      assetsHost: 'https://eu-assets.i.posthog.com',
      uiHost: 'https://eu.posthog.com',
    })
  })

  it('treats a blank region as the default and rejects an unknown one', () => {
    expect(posthogConfig({ POSTHOG_PROJECT_TOKEN: 'phc_x', POSTHOG_REGION: '' })?.region).toBe('us')
    expect(() => posthogConfig({ POSTHOG_PROJECT_TOKEN: 'phc_x', POSTHOG_REGION: 'mars' })).toThrow(/POSTHOG_REGION/)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd packages/observability; bunx vitest run tests/config.test.ts`
Expected: FAIL, cannot resolve `../src/config`.

- [ ] **Step 4: Implement `config.ts`**

`packages/observability/src/config.ts`:

```ts
/** PostHog Cloud regions; every host is derived from the region so they can't drift apart. */
export type PostHogRegion = 'us' | 'eu'

export interface PostHogConfig {
  /** The public project token (`phc_…`); safe to ship to browsers. */
  token: string
  region: PostHogRegion
  /** Event ingestion (`/e/`, `/flags`, `/s/`, …). */
  ingestHost: string
  /** Static SDK assets (`/static/*`) and remote config (`/array/*`). */
  assetsHost: string
  /** The PostHog app, for links the SDK builds (toolbar, replay). */
  uiHost: string
}

const REGIONS: readonly PostHogRegion[] = ['us', 'eu']

const blank = (value: string | undefined) => value === undefined || value.trim() === ''

/**
 * The PostHog settings from runtime env, or null when no token is set: every capture path is then a
 * no-op, so dev, tests and CI never send anything. Throws on an unknown region, a deploy mistake
 * that should fail loudly rather than silently drop events.
 */
export function posthogConfig(env: Record<string, string | undefined> = process.env): PostHogConfig | null {
  const token = env.POSTHOG_PROJECT_TOKEN
  if (blank(token)) return null
  const region = blank(env.POSTHOG_REGION) ? 'us' : (env.POSTHOG_REGION as string).trim()
  if (!REGIONS.includes(region as PostHogRegion)) throw new Error(`POSTHOG_REGION must be "us" or "eu", got "${region}"`)
  return {
    token: (token as string).trim(),
    region: region as PostHogRegion,
    ingestHost: `https://${region}.i.posthog.com`,
    assetsHost: `https://${region}-assets.i.posthog.com`,
    uiHost: `https://${region}.posthog.com`,
  }
}
```

- [ ] **Step 5: Run the config test**

Run: `cd packages/observability; bunx vitest run tests/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing cookie test**

`packages/observability/tests/cookie.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { posthogIdsFromCookie } from '../src/cookie'

const TOKEN = 'phc_abc'
const value = (o: unknown) => encodeURIComponent(JSON.stringify(o))

describe('posthogIdsFromCookie', () => {
  it('reads the distinct id and the session id', () => {
    const header = `a=1; ph_${TOKEN}_posthog=${value({ distinct_id: 'd-1', $sesid: [1, 's-1', 0] })}; b=2`
    expect(posthogIdsFromCookie(header, TOKEN)).toEqual({ distinctId: 'd-1', sessionId: 's-1' })
  })

  it('returns a null session id when the cookie has none', () => {
    const header = `ph_${TOKEN}_posthog=${value({ distinct_id: 'd-1' })}`
    expect(posthogIdsFromCookie(header, TOKEN)).toEqual({ distinctId: 'd-1', sessionId: null })
  })

  it('is null for a missing header, another project, malformed JSON or no distinct id', () => {
    expect(posthogIdsFromCookie(null, TOKEN)).toBeNull()
    expect(posthogIdsFromCookie(`ph_other_posthog=${value({ distinct_id: 'x' })}`, TOKEN)).toBeNull()
    expect(posthogIdsFromCookie(`ph_${TOKEN}_posthog=%7Bnot-json`, TOKEN)).toBeNull()
    expect(posthogIdsFromCookie(`ph_${TOKEN}_posthog=${value({ $sesid: [1, 's', 0] })}`, TOKEN)).toBeNull()
  })

  it('ignores ids too long to be real, so a forged cookie cannot bloat a JWT', () => {
    const header = `ph_${TOKEN}_posthog=${value({ distinct_id: 'x'.repeat(201) })}`
    expect(posthogIdsFromCookie(header, TOKEN)).toBeNull()
  })
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd packages/observability; bunx vitest run tests/cookie.test.ts`
Expected: FAIL, cannot resolve `../src/cookie`.

- [ ] **Step 8: Implement `cookie.ts`**

`packages/observability/src/cookie.ts`:

```ts
/** The visitor's PostHog identity as the browser SDK stored it. */
export interface PostHogIds {
  distinctId: string
  /** The current replay/web-analytics session, when the SDK has started one. */
  sessionId: string | null
}

/** Longer than any id posthog-js generates (UUIDv7 = 36 chars): a forged or corrupt cookie. */
const MAX_ID = 200

const id = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 && value.length <= MAX_ID ? value : null)

/**
 * Reads `ph_<token>_posthog` (URI-encoded JSON: `distinct_id`, `$sesid: [lastActivity, id, start]`)
 * from a Cookie header. Never throws: a missing or malformed cookie just means no identity.
 */
export function posthogIdsFromCookie(cookieHeader: string | null | undefined, token: string): PostHogIds | null {
  if (!cookieHeader) return null
  const name = `ph_${token}_posthog=`
  const raw = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(name))
    ?.slice(name.length)
  if (!raw) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { distinct_id?: unknown; $sesid?: unknown }
    const distinctId = id(parsed.distinct_id)
    if (!distinctId) return null
    const sessionId = Array.isArray(parsed.$sesid) ? id(parsed.$sesid[1]) : null
    return { distinctId, sessionId }
  } catch {
    return null
  }
}
```

- [ ] **Step 9: Run the cookie test**

Run: `cd packages/observability; bunx vitest run tests/cookie.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 10: Write the failing server-client test**

`packages/observability/tests/server.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

const ctor = vi.fn()
const captureException = vi.fn()
const flush = vi.fn(async () => {})
vi.mock('posthog-node', () => ({
  PostHog: class {
    constructor(...args: unknown[]) {
      ctor(...args)
    }
    captureException = captureException
    capture = vi.fn()
    flush = flush
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('serverPostHog', () => {
  it('is a no-op client without a token', async () => {
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', '')
    const { serverPostHog, captureServerError } = await import('../src/server')
    captureServerError(new Error('x'))
    await serverPostHog().flush()
    expect(ctor).not.toHaveBeenCalled()
  })

  it('builds one client for the region and sends immediately', async () => {
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', 'phc_x')
    vi.stubEnv('POSTHOG_REGION', 'eu')
    const { serverPostHog } = await import('../src/server')
    expect(serverPostHog()).toBe(serverPostHog())
    expect(ctor).toHaveBeenCalledTimes(1)
    expect(ctor).toHaveBeenCalledWith('phc_x', { host: 'https://eu.i.posthog.com', flushAt: 1, flushInterval: 0 })
  })

  it('captures errors with the distinct id and properties, and never throws', async () => {
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', 'phc_x')
    const { captureServerError } = await import('../src/server')
    const error = new Error('boom')
    captureServerError(error, { distinctId: 'd-1', properties: { route: '/x' } })
    expect(captureException).toHaveBeenCalledWith(error, 'd-1', { route: '/x' })
    captureException.mockImplementationOnce(() => {
      throw new Error('sdk down')
    })
    expect(() => captureServerError(error)).not.toThrow()
  })
})
```

- [ ] **Step 11: Run it to verify it fails**

Run: `cd packages/observability; bunx vitest run tests/server.test.ts`
Expected: FAIL, cannot resolve `../src/server`.

- [ ] **Step 12: Implement `server.ts`**

`packages/observability/src/server.ts`:

```ts
import { PostHog } from 'posthog-node'
import { posthogConfig } from './config'

/** The slice of posthog-node the apps use; the no-op client implements the same shape. */
export interface ServerPostHog {
  capture(message: { distinctId: string; event: string; properties?: Record<string, unknown> }): void
  captureException(error: unknown, distinctId?: string, properties?: Record<string, unknown>): void
  flush(): Promise<void>
}

const NOOP: ServerPostHog = { capture() {}, captureException() {}, flush: async () => {} }

let client: ServerPostHog | null = null

/**
 * The process's PostHog client, built on first use from runtime env (never at import: builds have
 * no env). `flushAt: 1` sends each event at once, so a process that dies without a shutdown loses
 * nothing queued, and no SIGTERM handler (which would block the default exit) is needed.
 */
export function serverPostHog(): ServerPostHog {
  if (client) return client
  const config = posthogConfig()
  client = config ? new PostHog(config.token, { host: config.ingestHost, flushAt: 1, flushInterval: 0 }) : NOOP
  return client
}

/** Reports a server error to Error Tracking. Fire-and-forget: observability never fails a request. */
export function captureServerError(error: unknown, opts: { distinctId?: string; properties?: Record<string, unknown> } = {}): void {
  try {
    serverPostHog().captureException(error, opts.distinctId, opts.properties)
  } catch (err) {
    console.warn('[observability] captureException failed', err instanceof Error ? err.message : err)
  }
}
```

- [ ] **Step 13: Run all package tests and type-check**

Run: `cd packages/observability; bunx vitest run`
Expected: PASS (3 files, 11 tests).
Run: `cd packages/observability; bunx tsc --noEmit`
Expected: no output.

- [ ] **Step 14: Commit**

```bash
git add packages/observability bun.lock
```
```bash
git commit -m "feat(observability): shared PostHog config, cookie parsing and server client"
```

---

### Task 2: Web client analytics (init, catalog, delegated clicks, sections)

**Files:**
- Create: `apps/web/lib/analytics/init.ts`, `events.ts`, `delegated.ts`, `sections.ts`, `request.ts`
- Create: `apps/web/features/analytics/Analytics.tsx`
- Modify: `apps/web/package.json`, `apps/web/next.config.js`, `apps/web/app/(site)/layout.tsx`, `apps/web/app/(os)/os/layout.tsx`
- Test: `apps/web/tests/unit/analytics/delegated.test.ts`, `sections.test.ts`, `init.test.ts`

- [ ] **Step 1: Add dependencies**

In `apps/web/package.json` `dependencies`, add `"@repo/observability": "*"` and `"posthog-js": "1.438.7"`. Then run `bun install`.

In `apps/web/next.config.js`, change `transpilePackages` to:

```js
  transpilePackages: ['@repo/twin', '@repo/observability'],
```

- [ ] **Step 2: Write the failing delegated-listener test**

`apps/web/tests/unit/analytics/delegated.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyLink, installDelegatedTracking } from '@/lib/analytics/delegated'

describe('classifyLink', () => {
  const origin = 'https://me.dev'
  it('classifies external links by channel', () => {
    expect(classifyLink('https://github.com/me/repo', origin)).toEqual({ href: 'https://github.com/me/repo', host: 'github.com', kind: 'external', channel: 'github' })
    expect(classifyLink('https://www.linkedin.com/in/me', origin)?.channel).toBe('linkedin')
    expect(classifyLink('https://cal.com/me/30min', origin)?.channel).toBe('calendar')
    expect(classifyLink('https://example.org', origin)?.channel).toBe('other')
  })
  it('classifies mailto as an email conversion without leaking the address host as a site', () => {
    expect(classifyLink('mailto:me@me.dev', origin)).toEqual({ href: 'mailto:me@me.dev', host: 'me.dev', kind: 'mailto', channel: 'email' })
  })
  it('ignores same-origin and relative links', () => {
    expect(classifyLink('/os', origin)).toBeNull()
    expect(classifyLink('https://me.dev/blog', origin)).toBeNull()
    expect(classifyLink('#work', origin)).toBeNull()
  })
})

describe('installDelegatedTracking', () => {
  const track = vi.fn()
  let uninstall: () => void
  beforeEach(() => {
    document.body.innerHTML = `
      <section aria-labelledby="work-title"><h2 id="work-title">Work</h2>
        <a id="ext" href="https://github.com/me">GitHub</a>
        <button id="cta" data-track="open_desktop"><span id="inner">Open</span></button>
      </section>
      <a id="mail" href="mailto:me@me.dev">Mail</a>
      <a id="local" href="/os">OS</a>`
    uninstall = installDelegatedTracking(track)
  })
  afterEach(() => {
    uninstall()
    track.mockReset()
  })
  const click = (id: string) => document.getElementById(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

  it('tracks outbound clicks with the section they sit in', () => {
    click('ext')
    expect(track).toHaveBeenCalledWith('outbound_click', { href: 'https://github.com/me', host: 'github.com', kind: 'external', channel: 'github', section: 'work-title' })
  })
  it('tracks mailto clicks outside any section', () => {
    click('mail')
    expect(track).toHaveBeenCalledWith('outbound_click', expect.objectContaining({ kind: 'mailto', section: null }))
  })
  it('tracks data-track CTAs from a nested click target', () => {
    click('inner')
    expect(track).toHaveBeenCalledWith('cta_clicked', { cta: 'open_desktop', section: 'work-title' })
  })
  it('ignores internal links', () => {
    click('local')
    expect(track).not.toHaveBeenCalled()
  })
  it('stops listening after uninstall', () => {
    uninstall()
    click('ext')
    expect(track).not.toHaveBeenCalled()
    uninstall = () => {}
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/web; bunx vitest run tests/unit/analytics/delegated.test.ts`
Expected: FAIL, cannot resolve `@/lib/analytics/delegated`.

- [ ] **Step 4: Implement the event catalog**

`apps/web/lib/analytics/events.ts`:

```ts
import posthog from 'posthog-js'

/** Where a link leads, for the outbound and conversion insights. */
export type LinkChannel = 'github' | 'linkedin' | 'email' | 'calendar' | 'other'

/**
 * Every custom event the site sends and its properties. PostHog's defaults cover pageviews,
 * page leave (time on page, scroll depth), web vitals, autocapture and exceptions.
 */
export interface AnalyticsEvents {
  outbound_click: { href: string; host: string; kind: 'external' | 'mailto'; channel: LinkChannel; section: string | null }
  cta_clicked: { cta: string; section: string | null }
  section_viewed: { section: string }
  role_selected: { role: string }
  theme_changed: { theme: 'light' | 'dark' }
  os_app_opened: { app: string }
  twin_session_started: { resumed: boolean }
  twin_message_sent: { chars: number; turn: number }
  twin_refusal: { reason: string }
  twin_reset: Record<string, never>
  booking_opened: Record<string, never>
  booking_completed: Record<string, never>
}

export type AnalyticsEvent = keyof AnalyticsEvents
export type Track = <E extends AnalyticsEvent>(event: E, properties: AnalyticsEvents[E]) => void

/** Sends one catalog event; a no-op until PostHog is initialised (no token, tests, SSR). */
export const track: Track = (event, properties) => {
  if (typeof window === 'undefined' || !posthog.__loaded) return
  posthog.capture(event, properties)
}
```

- [ ] **Step 5: Implement the delegated listener**

`apps/web/lib/analytics/delegated.ts`:

```ts
import type { AnalyticsEvents, LinkChannel, Track } from './events'

const CHANNELS: ReadonlyArray<[RegExp, LinkChannel]> = [
  [/(^|\.)github\.com$/, 'github'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)(cal\.com|calendly\.com)$/, 'calendar'],
]

/** An outbound link's tracking properties (minus section), or null when it stays on the site. */
export function classifyLink(href: string, origin: string): Omit<AnalyticsEvents['outbound_click'], 'section'> | null {
  if (href.startsWith('mailto:')) {
    const host = href.slice(7).split('?')[0]?.split('@')[1] ?? ''
    return { href, host, kind: 'mailto', channel: 'email' }
  }
  let url: URL
  try {
    url = new URL(href, origin)
  } catch {
    return null
  }
  if (!/^https?:$/.test(url.protocol) || url.origin === origin) return null
  const host = url.hostname
  const channel = CHANNELS.find(([pattern]) => pattern.test(host))?.[1] ?? 'other'
  return { href: url.href, host, kind: 'external', channel }
}

/** The labelled section a click happened in: the home page is one long page, sections are its map. */
function sectionOf(el: Element): string | null {
  return el.closest('[aria-labelledby]')?.getAttribute('aria-labelledby') ?? null
}

/**
 * One document-level click listener for every outbound link and `[data-track]` CTA. It covers
 * React links and the raw-HTML bio links alike, with no per-component wiring. Returns the uninstaller.
 */
export function installDelegatedTracking(track: Track): () => void {
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target) return
    const cta = target.closest('[data-track]')
    if (cta) track('cta_clicked', { cta: cta.getAttribute('data-track') ?? '', section: sectionOf(cta) })
    const anchor = target.closest('a[href]')
    if (!anchor) return
    const link = classifyLink(anchor.getAttribute('href') ?? '', window.location.origin)
    if (link) track('outbound_click', { ...link, section: sectionOf(anchor) })
  }
  document.addEventListener('click', onClick, { capture: true })
  return () => document.removeEventListener('click', onClick, { capture: true })
}
```

- [ ] **Step 6: Run the delegated test**

Run: `cd apps/web; bunx vitest run tests/unit/analytics/delegated.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 7: Write the failing sections test**

`apps/web/tests/unit/analytics/sections.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { observeSections } from '@/lib/analytics/sections'

type Callback = (entries: Array<{ isIntersecting: boolean; target: Element }>) => void
let fire: Callback
const disconnect = vi.fn()
const observed: Element[] = []

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: Callback, public options: IntersectionObserverInit) {
        fire = cb
      }
      observe(el: Element) {
        observed.push(el)
      }
      unobserve = vi.fn()
      disconnect = disconnect
    },
  )
  document.body.innerHTML = `
    <section aria-labelledby="work"></section>
    <section aria-labelledby="projects"></section>
    <section></section>`
})
afterEach(() => {
  vi.unstubAllGlobals()
  observed.length = 0
})

describe('observeSections', () => {
  it('observes labelled sections only and reports each once', () => {
    const track = vi.fn()
    const stop = observeSections(track)
    expect(observed).toHaveLength(2)
    fire([{ isIntersecting: true, target: observed[0]! }])
    fire([{ isIntersecting: true, target: observed[0]! }, { isIntersecting: false, target: observed[1]! }])
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('section_viewed', { section: 'work' })
    stop()
    expect(disconnect).toHaveBeenCalled()
  })
})
```

- [ ] **Step 8: Run it to verify it fails**

Run: `cd apps/web; bunx vitest run tests/unit/analytics/sections.test.ts`
Expected: FAIL, cannot resolve `@/lib/analytics/sections`.

- [ ] **Step 9: Implement `sections.ts`**

`apps/web/lib/analytics/sections.ts`:

```ts
import type { Track } from './events'

/**
 * Reports `section_viewed` once per labelled section when half of it is on screen: on a one-page
 * portfolio, the sections people actually reach are the navigation funnel. Returns the stopper.
 */
export function observeSections(track: Track, root: ParentNode = document): () => void {
  const seen = new Set<string>()
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const section = entry.target.getAttribute('aria-labelledby')
        if (!entry.isIntersecting || !section || seen.has(section)) continue
        seen.add(section)
        observer.unobserve(entry.target)
        track('section_viewed', { section })
      }
    },
    { threshold: 0.5 },
  )
  root.querySelectorAll('section[aria-labelledby]').forEach((el) => observer.observe(el))
  return () => observer.disconnect()
}
```

- [ ] **Step 10: Run the sections test**

Run: `cd apps/web; bunx vitest run tests/unit/analytics/sections.test.ts`
Expected: PASS.

- [ ] **Step 11: Write the failing init test**

`apps/web/tests/unit/analytics/init.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const posthog = vi.hoisted(() => ({ init: vi.fn(), register: vi.fn(), __loaded: false }))
vi.mock('posthog-js', () => ({ default: posthog }))

afterEach(() => {
  vi.resetModules()
  posthog.init.mockReset()
  posthog.register.mockReset()
})

describe('initPostHog', () => {
  it('initialises once through the first-party relay', async () => {
    const { initPostHog } = await import('@/lib/analytics/init')
    initPostHog({ token: 'phc_x', uiHost: 'https://us.posthog.com' }, false)
    initPostHog({ token: 'phc_x', uiHost: 'https://us.posthog.com' }, false)
    expect(posthog.init).toHaveBeenCalledTimes(1)
    expect(posthog.init).toHaveBeenCalledWith(
      'phc_x',
      expect.objectContaining({
        api_host: '/relay',
        ui_host: 'https://us.posthog.com',
        defaults: '2026-05-30',
        person_profiles: 'identified_only',
        capture_exceptions: true,
        capture_performance: { web_vitals: true, network_timing: true },
        respect_dnt: true,
      }),
    )
    expect(posthog.register).not.toHaveBeenCalled()
  })

  it('inside the monitor iframe, leaves pageviews and replay to the parent page', async () => {
    const { initPostHog } = await import('@/lib/analytics/init')
    initPostHog({ token: 'phc_x', uiHost: 'https://us.posthog.com' }, true)
    expect(posthog.init).toHaveBeenCalledWith(
      'phc_x',
      expect.objectContaining({ capture_pageview: false, capture_pageleave: false, disable_session_recording: true }),
    )
    expect(posthog.register).toHaveBeenCalledWith({ embedded: true })
  })
})
```

- [ ] **Step 12: Run it to verify it fails**

Run: `cd apps/web; bunx vitest run tests/unit/analytics/init.test.ts`
Expected: FAIL, cannot resolve `@/lib/analytics/init`.

- [ ] **Step 13: Implement `init.ts`, `request.ts` and the `Analytics` component**

`apps/web/lib/analytics/init.ts`:

```ts
import posthog, { type PostHogConfig } from 'posthog-js'

/** What the browser needs: the public token and the app host. Ingestion goes through `/relay`. */
export interface ClientAnalyticsConfig {
  token: string
  uiHost: string
}

let started = false

/**
 * Starts posthog-js once per document. `embedded` is the /os desktop iframed on the desk monitor:
 * the parent page already records that view and its replay, so the frame only sends its own events.
 */
export function initPostHog(config: ClientAnalyticsConfig, embedded: boolean): void {
  if (started) return
  started = true
  const options: Partial<PostHogConfig> = {
    api_host: '/relay',
    ui_host: config.uiHost,
    defaults: '2026-05-30',
    person_profiles: 'identified_only',
    capture_exceptions: true,
    capture_performance: { web_vitals: true, network_timing: true },
    respect_dnt: true,
    ...(embedded ? { capture_pageview: false, capture_pageleave: false, disable_session_recording: true } : {}),
  }
  posthog.init(config.token, options)
  if (embedded) posthog.register({ embedded: true })
}
```

`apps/web/lib/analytics/request.ts`:

```ts
import 'server-only'
import { posthogConfig } from '@repo/observability/config'
import { posthogIdsFromCookie, type PostHogIds } from '@repo/observability/cookie'
import type { ClientAnalyticsConfig } from './init'

/** The browser's config, read from runtime env per request (the image is built without it). */
export function clientAnalyticsConfig(): ClientAnalyticsConfig | null {
  const config = posthogConfig()
  return config ? { token: config.token, uiHost: config.uiHost } : null
}

/** The visitor's PostHog ids from the request cookie, or null (no token, no cookie, malformed). */
export function posthogIdsFromRequest(request: Request): PostHogIds | null {
  const config = posthogConfig()
  return config ? posthogIdsFromCookie(request.headers.get('cookie'), config.token) : null
}
```

`apps/web/features/analytics/Analytics.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import { installDelegatedTracking } from '@/lib/analytics/delegated'
import { track } from '@/lib/analytics/events'
import { initPostHog, type ClientAnalyticsConfig } from '@/lib/analytics/init'
import { observeSections } from '@/lib/analytics/sections'

/** Starts analytics for this document; renders nothing. A null config (no token) disables it. */
export function Analytics({ config }: { config: ClientAnalyticsConfig | null }) {
  useEffect(() => {
    if (!config) return
    initPostHog(config, window.self !== window.top)
    const uninstall = installDelegatedTracking(track)
    const stop = observeSections(track)
    return () => {
      uninstall()
      stop()
    }
  }, [config])
  return null
}
```

- [ ] **Step 14: Render `<Analytics>` in both root layouts**

In `apps/web/app/(site)/layout.tsx`, add these imports:

```tsx
import { Analytics } from '@/features/analytics/Analytics'
import { clientAnalyticsConfig } from '@/lib/analytics/request'
```

Change the body to:

```tsx
      <body>
        <div id="flick" aria-hidden="true" />
        {children}
        <Analytics config={clientAnalyticsConfig()} />
      </body>
```

In `apps/web/app/(os)/os/layout.tsx`, add the same two imports and change `<body>{children}</body>` to:

```tsx
      <body>
        {children}
        <Analytics config={clientAnalyticsConfig()} />
      </body>
```

- [ ] **Step 15: Run the analytics tests and type-check**

Run: `cd apps/web; bunx vitest run tests/unit/analytics`
Expected: PASS (3 files).
Run: `cd apps/web; bun run check-types`
Expected: exits 0. If `capture_performance`'s type rejects `network_timing`, open `node_modules/posthog-js/dist/module.d.ts`, find `PerformanceCaptureConfig` and use its exact field names. Update the init test to match.

- [ ] **Step 16: Commit**

```bash
git add apps/web bun.lock
```
```bash
git commit -m "feat(web): PostHog client analytics with outbound, CTA and section tracking"
```

---

### Task 3: `/relay` reverse proxy

**Files:**
- Create: `apps/web/lib/analytics/relay.ts`, `apps/web/proxy.ts`
- Modify: `apps/web/next.config.js`
- Test: `apps/web/tests/unit/analytics/relay.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/tests/unit/analytics/relay.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { relayTarget } from '@/lib/analytics/relay'

const hosts = { ingestHost: 'https://us.i.posthog.com', assetsHost: 'https://us-assets.i.posthog.com' }

describe('relayTarget', () => {
  it('sends SDK assets and remote config to the assets host', () => {
    expect(relayTarget('/relay/static/array.js', '', hosts)?.href).toBe('https://us-assets.i.posthog.com/static/array.js')
    expect(relayTarget('/relay/array/phc_x/config.js', '', hosts)?.href).toBe('https://us-assets.i.posthog.com/array/phc_x/config.js')
  })
  it('sends everything else to the ingest host, keeping the query and trailing slash', () => {
    expect(relayTarget('/relay/e/', '?ip=0&ver=1', hosts)?.href).toBe('https://us.i.posthog.com/e/?ip=0&ver=1')
    expect(relayTarget('/relay/flags', '?v=2', hosts)?.href).toBe('https://us.i.posthog.com/flags?v=2')
  })
  it('refuses paths outside the relay, and an unconfigured relay', () => {
    expect(relayTarget('/api/x', '', hosts)).toBeNull()
    expect(relayTarget('/relay/e/', '', null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web; bunx vitest run tests/unit/analytics/relay.test.ts`
Expected: FAIL, cannot resolve `@/lib/analytics/relay`.

- [ ] **Step 3: Implement `relay.ts` and `proxy.ts`**

`apps/web/lib/analytics/relay.ts`:

```ts
import type { PostHogConfig } from '@repo/observability/config'

/** The first-party path posthog-js uses as `api_host`; it avoids words ad blockers match. */
export const RELAY_PATH = '/relay'

/**
 * Where a `/relay/*` request goes at PostHog (posthog.com/docs/advanced/proxy/nextjs): assets and
 * remote config to the assets host, everything else to ingestion. Null when unconfigured.
 */
export function relayTarget(pathname: string, search: string, hosts: Pick<PostHogConfig, 'ingestHost' | 'assetsHost'> | null): URL | null {
  if (!hosts || !pathname.startsWith(`${RELAY_PATH}/`)) return null
  const rest = pathname.slice(RELAY_PATH.length)
  const host = rest.startsWith('/static/') || rest.startsWith('/array/') ? hosts.assetsHost : hosts.ingestHost
  return new URL(`${rest}${search}`, host)
}
```

`apps/web/proxy.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { posthogConfig } from '@repo/observability/config'
import { relayTarget } from '@/lib/analytics/relay'

/**
 * The PostHog reverse proxy, resolved per request so the region is runtime config
 * (`next.config` rewrites are frozen into a standalone build).
 */
export function proxy(request: NextRequest) {
  const target = relayTarget(request.nextUrl.pathname, request.nextUrl.search, posthogConfig())
  if (!target) return new NextResponse(null, { status: 404 })
  const headers = new Headers(request.headers)
  headers.set('host', target.host)
  return NextResponse.rewrite(target, { request: { headers } })
}

export const config = { matcher: '/relay/:path*' }
```

In `apps/web/next.config.js`, add this inside `nextConfig`:

```js
  // PostHog's API paths end in a slash (`/e/`); a redirect would drop the POST body.
  skipTrailingSlashRedirect: true,
```

- [ ] **Step 4: Run the test and type-check**

Run: `cd apps/web; bunx vitest run tests/unit/analytics/relay.test.ts`
Expected: PASS (3 tests).
Run: `cd apps/web; bun run check-types`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web
```
```bash
git commit -m "feat(web): first-party /relay proxy to PostHog resolved at runtime"
```

---

### Task 4: Explicit product events

**Files:**
- Modify: `apps/web/features/role/RoleProvider.tsx:35-41`, `apps/web/features/theme/WallSwitch.tsx:35-46`, `apps/web/features/os/Desktop.tsx:32`, `apps/web/features/figure/Figure.tsx:66-77`, `apps/web/features/os/apps/messenger/use-twin.ts`, `apps/web/features/os/apps/messenger/cal-embed.ts:86-93`
- Test: `apps/web/tests/unit/analytics/twin-events.test.ts`

The pure helpers stay testable. Wiring into components is one line each.

- [ ] **Step 1: Role, theme, OS app and desk CTAs**

In `RoleProvider.tsx`, import `import { track } from '@/lib/analytics/events'` and change `select`:

```tsx
  const select = useCallback(
    (slug: string) => {
      const i = slugs.indexOf(slug)
      if (i < 0) return
      dispatch({ type: 'select', index: i })
      track('role_selected', { role: slug })
    },
    [slugs],
  )
```

In `WallSwitch.tsx`, import `track` and add `track('theme_changed', { theme: next })` right after `applyTheme(next)` inside `onClick`.

In `Desktop.tsx`, import `track` and change `open`:

```tsx
  const open = useCallback((id: string) => {
    dispatch({ type: 'open', id })
    track('os_app_opened', { app: id })
  }, [])
```

`boot` dispatches `open` directly (not through `open`), so the automatic boot app is never counted as a visitor action. That is intended.

In `Figure.tsx`, add `data-track` attributes. Leave the inline full-screen bar's Mute and Exit buttons alone: the caption buttons are the entry points.
- Caption Mute button: `data-track="desk_mute"`
- Full screen button: `data-track="desk_fullscreen"`
- The "Open the desktop →" anchor: `data-track="open_desktop"`

- [ ] **Step 2: Write the failing twin-events test**

The twin hook is hard to render. Extract the decisions as pure functions in a new file and test those.

`apps/web/tests/unit/analytics/twin-events.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { messageSentProps } from '@/features/os/apps/messenger/twin-analytics'

describe('messageSentProps', () => {
  it('counts characters and the visitor turn, never the text', () => {
    const props = messageSentProps('  hello there  ', 2)
    expect(props).toEqual({ chars: 11, turn: 3 })
    expect(JSON.stringify(props)).not.toContain('hello')
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/web; bunx vitest run tests/unit/analytics/twin-events.test.ts`
Expected: FAIL, cannot resolve `twin-analytics`.

- [ ] **Step 4: Implement `twin-analytics.ts` and wire `use-twin.ts`**

`apps/web/features/os/apps/messenger/twin-analytics.ts`:

```ts
import type { AnalyticsEvents } from '@/lib/analytics/events'

/** A sent message as analytics sees it: its size and position, never its text (that is in the LLM trace). */
export function messageSentProps(text: string, previousVisitorTurns: number): AnalyticsEvents['twin_message_sent'] {
  return { chars: text.trim().length, turn: previousVisitorTurns + 1 }
}
```

In `use-twin.ts`:
- Import `track` and `messageSentProps`.
- After `const [initial] = useState(savedSession)`, add a mount effect:

```ts
  useEffect(() => {
    track('twin_session_started', { resumed: initial !== undefined })
  }, [initial])
```

- In `reset`, add `track('twin_reset', {})` before `resetAgent()`.
- In `fail`, after `setRefusal(refusalOf(error))`, call `track('twin_refusal', { reason: refusalOf(error) })`. Compute `refusalOf(error)` once into a const and use it for both.
- In `send`, right after `lastSent.current = text`, add:

```ts
      track('twin_message_sent', messageSentProps(text, messages.current.filter((m) => m.role === 'user').length))
```

- In the `failed` effect, where `setRefusal('offline')` is called, also call `track('twin_refusal', { reason: 'offline' })`. Do the same in the resume-stall timer.

- [ ] **Step 5: Booking events**

In `cal-embed.ts` `mountInline`, after the `api('ui', …)` line, register Cal's documented embed event listener and emit the opened event:

```ts
  api('on', { action: 'bookingSuccessful', callback: () => track('booking_completed', {}) })
  track('booking_opened', {})
```

Add `import { track } from '@/lib/analytics/events'` at the top. `CalNamespace` is typed `(method: string, options: Record<string, unknown>)`, so the `on` call type-checks as is.

- [ ] **Step 6: Run the web unit suite and type-check**

Run: `cd apps/web; bunx vitest run`
Expected: all tests pass (the 473 baseline plus the new ones). If an existing cal-embed test asserts the exact queued commands, update its expectation to include the `on` command.
Run: `cd apps/web; bun run check-types`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web
```
```bash
git commit -m "feat(web): product events for role, theme, OS apps, desk CTAs, twin chat and booking"
```

---

### Task 5: Web error tracking

**Files:**
- Create: `apps/web/instrumentation.ts`, `apps/web/app/(site)/global-error.tsx`, `apps/web/app/(os)/os/error.tsx`
- Modify: `apps/web/app/(site)/error.tsx`, `apps/web/app/(site)/blog/error.tsx`, `apps/web/app/api/twin/eve/v1/[...path]/route.ts:52-61`
- Test: `apps/web/tests/unit/analytics/instrumentation.test.ts`

- [ ] **Step 1: Write the failing instrumentation test**

`apps/web/tests/unit/analytics/instrumentation.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

const captureServerError = vi.hoisted(() => vi.fn())
vi.mock('@repo/observability/server', () => ({ captureServerError }))

afterEach(() => {
  vi.unstubAllEnvs()
  captureServerError.mockReset()
})

describe('onRequestError', () => {
  it('reports the error with the visitor distinct id and the route', async () => {
    vi.stubEnv('POSTHOG_PROJECT_TOKEN', 'phc_x')
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const { onRequestError } = await import('@/instrumentation')
    const cookie = `ph_phc_x_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: 'd-1' }))}`
    const error = new Error('boom')
    await onRequestError(error, { path: '/x', method: 'GET', headers: { cookie } }, { routerKind: 'App Router', routePath: '/x', routeType: 'render', renderSource: 'server-rendering', revalidateReason: undefined })
    expect(captureServerError).toHaveBeenCalledWith(error, { distinctId: 'd-1', properties: { path: '/x', method: 'GET', routePath: '/x', routeType: 'render' } })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web; bunx vitest run tests/unit/analytics/instrumentation.test.ts`
Expected: FAIL, cannot resolve `@/instrumentation`.

- [ ] **Step 3: Implement `instrumentation.ts`**

`apps/web/instrumentation.ts`:

```ts
import type { Instrumentation } from 'next'

/** Server render, route handler and proxy errors go to PostHog Error Tracking. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { posthogConfig } = await import('@repo/observability/config')
  const { posthogIdsFromCookie } = await import('@repo/observability/cookie')
  const { captureServerError } = await import('@repo/observability/server')
  const config = posthogConfig()
  const cookie = request.headers.cookie
  const ids = config ? posthogIdsFromCookie(Array.isArray(cookie) ? cookie.join('; ') : cookie, config.token) : null
  captureServerError(error, {
    distinctId: ids?.distinctId,
    properties: { path: request.path, method: request.method, routePath: context.routePath, routeType: context.routeType },
  })
}
```

- [ ] **Step 4: Run the test**

Run: `cd apps/web; bunx vitest run tests/unit/analytics/instrumentation.test.ts`
Expected: PASS.

- [ ] **Step 5: Error boundaries**

`apps/web/app/(site)/error.tsx`: add `import { useEffect } from 'react'` and `import posthog from 'posthog-js'`, destructure `error` and capture it:

```tsx
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    posthog.captureException(error)
  }, [error])
```

Keep the existing JSX. Apply the same pattern to `apps/web/app/(site)/blog/error.tsx` (`PreviewError({ error }: { error: Error & { digest?: string } })`).

`apps/web/app/(os)/os/error.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import posthog from 'posthog-js'

/** The desktop crashed: report it and offer a reboot instead of a blank monitor. */
export default function OsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    posthog.captureException(error)
  }, [error])
  return (
    <main style={{ padding: 24, fontFamily: 'var(--os-serif, serif)' }}>
      <p>The desktop stopped responding.</p>
      <button type="button" onClick={() => retry()}>Restart</button>
    </main>
  )
}
```

`apps/web/app/(site)/global-error.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import posthog from 'posthog-js'

/** Last-resort boundary (the root layout itself failed): report it and render a bare page. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    posthog.captureException(error)
  }, [error])
  return (
    <html lang="en">
      <body>
        <main>
          <h1>Something went quiet.</h1>
          <button type="button" onClick={() => retry()}>Try again</button>
        </main>
      </body>
    </html>
  )
}
```

The prop is `retry`, matching the existing `error.tsx` on this Next version. If `next typegen` reports `global-error` must take `reset`, use whichever name the generated types require for both files.

- [ ] **Step 6: Capture BFF failures**

In `route.ts`, import `import { captureServerError } from '@repo/observability/server'` and `import { posthogIdsFromRequest } from '@/lib/analytics/request'`. In `failSafe`'s catch, after the `console.error`, add:

```ts
      captureServerError(error, { distinctId: posthogIdsFromRequest(request)?.distinctId, properties: { handler: `twin.${name}` } })
```

- [ ] **Step 7: Run the web suite and type-check**

Run: `cd apps/web; bunx vitest run`
Expected: all pass. `tests/unit/twin/route.test.ts` still passes, since without a token `captureServerError` is a no-op.
Run: `cd apps/web; bun run check-types`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web
```
```bash
git commit -m "feat(web): client, server and BFF errors reach PostHog Error Tracking"
```

---

### Task 6: Join the chat to the visitor (JWT claims `ph_did` / `ph_sid`)

**Files:**
- Modify: `apps/web/lib/twin/jwt.ts`, `apps/web/lib/twin/upstream.ts`, `apps/web/app/api/twin/eve/v1/[...path]/route.ts`
- Modify: `apps/agents/agent/lib/visitor-auth.ts`
- Test: `apps/web/tests/unit/twin/jwt.test.ts` (extend it or create it), `apps/agents/tests/visitor-auth.test.ts` (extend the existing one)

- [ ] **Step 1: Write the failing web JWT test**

Check `ls apps/web/tests/unit/twin/` for an existing jwt test. Add this case to it, or create `jwt.test.ts`:

```ts
import { decodeJwt } from 'jose'
import { describe, expect, it } from 'vitest'
import { mintVisitorJwt } from '@/lib/twin/jwt'

const SECRET = 's'.repeat(32)
const VISITOR = '11111111-1111-4111-8111-111111111111'

describe('mintVisitorJwt analytics claims', () => {
  it('carries the PostHog ids when the browser has them', async () => {
    const token = await mintVisitorJwt(VISITOR, 'Europe/Lisbon', SECRET, 1_000, { distinctId: 'd-1', sessionId: 's-1' })
    expect(decodeJwt(token)).toMatchObject({ sub: VISITOR, tz: 'Europe/Lisbon', ph_did: 'd-1', ph_sid: 's-1' })
  })
  it('omits them otherwise', async () => {
    const claims = decodeJwt(await mintVisitorJwt(VISITOR, undefined, SECRET, 1_000, null))
    expect(claims).not.toHaveProperty('ph_did')
    expect(claims).not.toHaveProperty('ph_sid')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web; bunx vitest run tests/unit/twin/jwt.test.ts`
Expected: FAIL. The fifth argument is ignored, so there is no `ph_did`.

- [ ] **Step 3: Implement the web side**

`jwt.ts`: import `type PostHogIds` from `@repo/observability/cookie` and change `mintVisitorJwt`:

```ts
export async function mintVisitorJwt(
  visitorId: string,
  tz: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  analytics: PostHogIds | null = null,
): Promise<string> {
  const claims: Record<string, string> = {}
  if (tz) claims.tz = tz
  // The browser's PostHog identity, so the agent's LLM traces join the visitor's pageviews and replay.
  if (analytics) {
    claims.ph_did = analytics.distinctId
    if (analytics.sessionId) claims.ph_sid = analytics.sessionId
  }
  return new SignJWT(claims)
```

The rest of the chain is unchanged.

`upstream.ts`: add `analytics?: PostHogIds | null` to `AgentRequest` (import the type). In `agentFetch`, pass it through:

```ts
  const token = await mintVisitorJwt(visitorId, safeTimeZone(init.tz), env.TWIN_JWT_SECRET, undefined, init.analytics ?? null)
```

`route.ts`: in `POST` and `GET`, compute `const analytics = posthogIdsFromRequest(request)` next to `tz`. Pass `analytics` in every `agentFetch` and `agentSendWhenReady` init object, and as a third parameter to `createSession(visitorId, tz, analytics)`, which forwards it to its two `agentFetch` calls.

- [ ] **Step 4: Run the web test**

Run: `cd apps/web; bunx vitest run tests/unit/twin`
Expected: PASS, including the existing route tests.

- [ ] **Step 5: Write the failing agent test**

In `apps/agents/tests/visitor-auth.test.ts` (find it with `ls apps/agents/tests | grep -i visitor`; create it if absent), add:

```ts
import { describe, expect, it } from 'vitest'
import { toVisitorPrincipal } from '../agent/lib/visitor-auth'

const SUBJECT = '11111111-1111-4111-8111-111111111111'

describe('toVisitorPrincipal analytics attributes', () => {
  it('keeps the PostHog ids next to the zone', () => {
    const p = toVisitorPrincipal({ principalType: 'service', principalId: 'x', authenticator: 'jwt', subject: SUBJECT, attributes: { tz: 'UTC', ph_did: 'd-1', ph_sid: 's-1' } })
    expect(p?.attributes).toEqual({ tz: 'UTC', ph_did: 'd-1', ph_sid: 's-1' })
  })
  it('drops non-string or oversized values', () => {
    const p = toVisitorPrincipal({ principalType: 'service', principalId: 'x', authenticator: 'jwt', subject: SUBJECT, attributes: { ph_did: 'x'.repeat(201), ph_sid: ['a'] } })
    expect(p?.attributes).toEqual({})
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/agents; bunx vitest run tests/visitor-auth.test.ts`
Expected: FAIL, `ph_did` is missing from `attributes`.

- [ ] **Step 7: Implement it in `visitor-auth.ts`**

Replace the `attributes:` expression in `toVisitorPrincipal` with a call to a new helper:

```ts
const CARRIED = ['tz', 'ph_did', 'ph_sid'] as const

/** The JWT claims the twin reads: the zone and the browser's PostHog ids. Anything else is dropped. */
function carriedAttributes(attributes: VisitorPrincipal['attributes'] | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of CARRIED) {
    const value = attributes?.[key]
    if (typeof value === 'string' && value.length > 0 && value.length <= 200) out[key] = value
  }
  return out
}
```

Then use `attributes: carriedAttributes(p.attributes)`. `tz` stays a string claim; `visitorTimeZoneOf` validates it as before.

- [ ] **Step 8: Run the agents suite**

Run: `cd apps/agents; bunx vitest run`
Expected: all pass. `bun run skills` runs automatically only via `bun run test`; if the suite complains that `generated.ts` is missing, run `bun run test` instead.

- [ ] **Step 9: Commit**

```bash
git add apps/web apps/agents
```
```bash
git commit -m "feat(twin): the visitor JWT carries the browser's PostHog ids to the agent"
```

---

### Task 7: SEO hygiene

**Files:**
- Create: `apps/web/lib/site.ts`, `apps/web/lib/seo/json-ld.ts`, `apps/web/app/robots.ts`, `apps/web/app/sitemap.ts`, `apps/web/app/(site)/not-found.tsx`
- Modify: `apps/web/app/(site)/layout.tsx`, `apps/web/app/(site)/page.tsx`, `apps/web/features/portfolio/Portfolio.tsx`
- Test: `apps/web/tests/unit/seo/seo.test.ts`

- [ ] **Step 1: Write the failing SEO test**

`apps/web/tests/unit/seo/seo.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Portfolio } from '@/lib/cms/types'
import { personJsonLd } from '@/lib/seo/json-ld'

afterEach(() => vi.unstubAllEnvs())

const data = {
  profile: { name: 'Ada Lovelace', headlineTail: 'builds things', email: 'ada@x.dev' },
  disciplines: [{ slug: 'eng', title: 'Software engineer', level: '', caption: '', bio: [], notes: [] }],
  defaultSlug: 'eng',
  contactLinks: [
    { label: 'GitHub', chip: 'GH', href: 'https://github.com/ada' },
    { label: 'Email', chip: '@', href: 'mailto:ada@x.dev' },
  ],
  settings: { seo: { title: 'Ada', description: 'Engineer', ogImage: 'https://cms.x.dev/og.png' } },
} as unknown as Portfolio

describe('siteUrl', () => {
  it('uses SITE_URL without a trailing slash, else localhost', async () => {
    const { siteUrl } = await import('@/lib/site')
    vi.stubEnv('SITE_URL', 'https://ada.dev/')
    expect(siteUrl()).toBe('https://ada.dev')
    vi.stubEnv('SITE_URL', '')
    expect(siteUrl()).toBe('http://localhost:3000')
  })
})

describe('personJsonLd', () => {
  it('describes the owner and the site, with web profiles only', () => {
    const graph = personJsonLd(data, 'https://ada.dev')
    expect(graph).toEqual({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Person', '@id': 'https://ada.dev/#person', name: 'Ada Lovelace', jobTitle: 'Software engineer', url: 'https://ada.dev', image: 'https://cms.x.dev/og.png', sameAs: ['https://github.com/ada'] },
        { '@type': 'WebSite', '@id': 'https://ada.dev/#website', url: 'https://ada.dev', name: 'Ada', description: 'Engineer', publisher: { '@id': 'https://ada.dev/#person' } },
      ],
    })
  })
})

describe('robots and sitemap', () => {
  it('keeps crawlers off private paths and points to the sitemap', async () => {
    vi.stubEnv('SITE_URL', 'https://ada.dev')
    const { default: robots } = await import('@/app/robots')
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/relay/', '/blog/preview/', '/os'] },
      sitemap: 'https://ada.dev/sitemap.xml',
      host: 'https://ada.dev',
    })
  })
  it('lists the home page', async () => {
    vi.stubEnv('SITE_URL', 'https://ada.dev')
    const { default: sitemap } = await import('@/app/sitemap')
    expect(sitemap()).toEqual([{ url: 'https://ada.dev/', changeFrequency: 'monthly', priority: 1 }])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web; bunx vitest run tests/unit/seo/seo.test.ts`
Expected: FAIL, the modules don't exist.

- [ ] **Step 3: Implement `site.ts`, `json-ld.ts`, `robots.ts` and `sitemap.ts`**

`apps/web/lib/site.ts`:

```ts
/** The public origin (no trailing slash), from runtime env; localhost in dev. */
export function siteUrl(): string {
  const raw = process.env.SITE_URL?.trim()
  return raw ? raw.replace(/\/+$/, '') : 'http://localhost:3000'
}
```

`apps/web/lib/seo/json-ld.ts`:

```ts
import type { Portfolio } from '@/lib/cms/types'

/** schema.org Person + WebSite for the home page: what search engines use for a person's knowledge panel. */
export function personJsonLd(data: Pick<Portfolio, 'profile' | 'disciplines' | 'defaultSlug' | 'contactLinks' | 'settings'>, site: string) {
  const person = `${site}/#person`
  const jobTitle = data.disciplines.find((d) => d.slug === data.defaultSlug)?.title ?? data.disciplines[0]?.title
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': person,
        name: data.profile.name,
        ...(jobTitle ? { jobTitle } : {}),
        url: site,
        ...(data.settings.seo.ogImage ? { image: data.settings.seo.ogImage } : {}),
        sameAs: data.contactLinks.map((l) => l.href).filter((href) => /^https?:\/\//.test(href)),
      },
      { '@type': 'WebSite', '@id': `${site}/#website`, url: site, name: data.settings.seo.title, description: data.settings.seo.description, publisher: { '@id': person } },
    ],
  }
}
```

`apps/web/app/robots.ts`:

```ts
import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

/** Crawl the letter; skip the API, the analytics relay, editor previews and the noindex desktop. */
export default function robots(): MetadataRoute.Robots {
  const site = siteUrl()
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/relay/', '/blog/preview/', '/os'] },
    sitemap: `${site}/sitemap.xml`,
    host: site,
  }
}
```

`apps/web/app/sitemap.ts`:

```ts
import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

/** One public page today; the blog adds its posts here when it launches. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${siteUrl()}/`, changeFrequency: 'monthly', priority: 1 }]
}
```

Both files read env at request time only if they are dynamic. Add `export const dynamic = 'force-dynamic'` to both `robots.ts` and `sitemap.ts`, since `SITE_URL` is runtime config and must not be frozen at build. Add a one-line comment saying that.

- [ ] **Step 4: Run the SEO test**

Run: `cd apps/web; bunx vitest run tests/unit/seo/seo.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Metadata, JSON-LD, footer, 404 and preconnect**

`apps/web/app/(site)/layout.tsx`: add the imports, then export `generateMetadata` (dynamic because `SITE_URL` is runtime) and a preconnect:

```tsx
import type { Metadata } from 'next'
import { preconnect } from 'react-dom'
import { siteUrl } from '@/lib/site'

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(siteUrl()),
    openGraph: { type: 'website', locale: 'en_US' },
    twitter: { card: 'summary_large_image' },
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
  }
}
```

In `RootLayout`, before `return`, add:

```tsx
  // CMS uploads (favicons, OG image) load from the CMS origin: open the connection early.
  const cms = process.env.CMS_URL
  if (cms && new URL(cms).origin !== new URL(siteUrl()).origin) preconnect(new URL(cms).origin)
```

`apps/web/app/(site)/page.tsx`: change `generateMetadata` and render JSON-LD:

```tsx
import { personJsonLd } from '@/lib/seo/json-ld'
import { siteUrl } from '@/lib/site'

export async function generateMetadata(): Promise<Metadata> {
  const { settings, profile } = await getPortfolio()
  const images = settings.seo.ogImage ? [settings.seo.ogImage] : undefined
  return {
    title: settings.seo.title,
    description: settings.seo.description,
    alternates: { canonical: '/' },
    // Next merges metadata shallowly: this object replaces the layout's openGraph, so it repeats type and locale.
    openGraph: { type: 'website', locale: 'en_US', title: settings.seo.title, description: settings.seo.description, siteName: profile.name, url: '/', images },
    twitter: { title: settings.seo.title, description: settings.seo.description, images },
  }
}

export default async function Page() {
  const data = await getPortfolio()
  // `<` escaped so CMS text can never close the script element.
  const jsonLd = JSON.stringify(personJsonLd(data, siteUrl())).replace(/</g, '\\u003c')
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <Portfolio data={data} />
    </>
  )
}
```

`apps/web/features/portfolio/Portfolio.tsx`: move `<FooterNav … />` out of `<main>`, so it sits right after `</main>` inside `<CuriousProvider>`. Run the e2e layout spec later (Task 11) to confirm nothing visual broke. If `globals.css` styles `main > footer`, change that selector to `body footer`, or whatever matches the new position. Check with `grep -rn "footer" apps/web/app/globals.css apps/web/features/sections/*.css`.

`apps/web/app/(site)/not-found.tsx`:

```tsx
import Link from 'next/link'

export const metadata = { title: 'Not found', robots: { index: false } }

/** A letter-styled 404 that leads back home. */
export default function NotFound() {
  return (
    <main>
      <h1><span className="who">Nothing here.</span></h1>
      <p>
        This page doesn&rsquo;t exist. <Link href="/">Back to the letter</Link>
      </p>
    </main>
  )
}
```

- [ ] **Step 6: Run the web suite and type-check**

Run: `cd apps/web; bunx vitest run`
Expected: all pass.
Run: `cd apps/web; bun run check-types`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web
```
```bash
git commit -m "feat(web): metadataBase, canonical, robots, sitemap, Person JSON-LD, semantic footer and 404"
```

---

### Task 8: Agent LLM traces to PostHog (OTel)

**Files:**
- Create: `apps/agents/agent/lib/observability/trace-context.ts`, `apps/agents/agent/lib/observability/processor.ts`
- Create: `apps/agents/agent/instrumentation/otel.ts`, `apps/agents/agent/instrumentation/posthog.ts`
- Modify: `apps/agents/package.json`, `packages/twin/src/env.ts`
- Test: `apps/agents/tests/observability-trace-context.test.ts`, `apps/agents/tests/observability-processor.test.ts`

- [ ] **Step 1: Dependencies and env schema**

In `apps/agents/package.json` `dependencies`, add:
- `"@repo/observability": "*"`
- `"@posthog/ai": "8.13.5"`
- `"@opentelemetry/api": "1.9.1"`
- `"@opentelemetry/sdk-trace-base": "2.11.0"`
- `"@opentelemetry/exporter-trace-otlp-http": "0.218.0"`

The last two are `@posthog/ai/otel` peers, at the versions already in the lockfile. Run `bun install`.

In `packages/twin/src/env.ts` `agentsEnvObject`, add after `TWIN_ABUSE_TIMEOUT_MS`:

```ts
  // PostHog (LLM traces, errors). Optional: blank disables observability. Read by @repo/observability.
  POSTHOG_PROJECT_TOKEN: z.string().min(1).optional(),
  POSTHOG_REGION: z.enum(['us', 'eu']).default('us'),
```

- [ ] **Step 2: Write the failing trace-context test**

`apps/agents/tests/observability-trace-context.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { contextAttributes, runtimeContextOf, traceIdentity } from '../agent/lib/observability/trace-context'

const principal = (attributes: Record<string, string>) => ({ principalType: 'user', principalId: 'web:11111111-1111-4111-8111-111111111111', authenticator: 'twin-web', attributes })

describe('traceIdentity', () => {
  it('uses the browser PostHog ids when the JWT carried them', () => {
    expect(traceIdentity(principal({ ph_did: 'd-1', ph_sid: 's-1' }), 'eve-1')).toEqual({ distinctId: 'd-1', conversationId: 'eve-1', replaySessionId: 's-1' })
  })
  it('falls back to the principal, then to the session, so traces are never randomly anonymous', () => {
    expect(traceIdentity(principal({}), 'eve-1')).toEqual({ distinctId: 'web:11111111-1111-4111-8111-111111111111', conversationId: 'eve-1', replaySessionId: null })
    expect(traceIdentity(null, 'eve-1')).toEqual({ distinctId: 'twin-session:eve-1', conversationId: 'eve-1', replaySessionId: null })
  })
})

describe('runtime context and span attributes', () => {
  it('names the keys PostHog maps (distinctId → person, sessionId → $ai_session_id, $session_id → replay)', () => {
    const id = traceIdentity(principal({ ph_did: 'd-1', ph_sid: 's-1' }), 'eve-1')
    expect(runtimeContextOf(id)).toEqual({ distinctId: 'd-1', sessionId: 'eve-1', $session_id: 's-1' })
    expect(contextAttributes(id)).toEqual({ 'ai.settings.context.distinctId': 'd-1', 'ai.settings.context.sessionId': 'eve-1', 'ai.settings.context.$session_id': 's-1' })
  })
  it('omits the replay key without a browser session', () => {
    expect(runtimeContextOf(traceIdentity(null, 'eve-1'))).toEqual({ distinctId: 'twin-session:eve-1', sessionId: 'eve-1' })
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/agents; bunx vitest run tests/observability-trace-context.test.ts`
Expected: FAIL, the module doesn't exist.

- [ ] **Step 4: Implement `trace-context.ts`**

`apps/agents/agent/lib/observability/trace-context.ts`:

```ts
import type { Principal } from '../identity'

/** Who a twin trace belongs to in PostHog. */
export interface TraceIdentity {
  /** The browser's PostHog distinct id when known, so traces join the visitor's person timeline. */
  distinctId: string
  /** The eve session: one conversation, PostHog's `$ai_session_id`. */
  conversationId: string
  /** The browser's PostHog session, which links the trace to the replay. */
  replaySessionId: string | null
}

const attr = (p: Pick<Principal, 'attributes'> | null | undefined, key: string): string | null => {
  const value = p?.attributes[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** The trace identity for a session, from the principal's JWT-carried PostHog ids. */
export function traceIdentity(principal: Pick<Principal, 'principalId' | 'attributes'> | null | undefined, sessionId: string): TraceIdentity {
  return {
    distinctId: attr(principal, 'ph_did') ?? principal?.principalId ?? `twin-session:${sessionId}`,
    conversationId: sessionId,
    replaySessionId: attr(principal, 'ph_sid'),
  }
}

/**
 * eve's runtime context for model spans. The key names follow PostHog's AI SDK v7 OTel mapping
 * (posthog.com/docs/llm-analytics/installation/vercel-ai): `distinctId`, `sessionId`; other
 * scalars become event properties, so `$session_id` links session replay.
 */
export function runtimeContextOf(id: TraceIdentity): Record<string, string> {
  return { distinctId: id.distinctId, sessionId: id.conversationId, ...(id.replaySessionId ? { $session_id: id.replaySessionId } : {}) }
}

/** The same context as span attributes, for spans the twin starts itself (eve flattens to `ai.settings.context.*`). */
export function contextAttributes(id: TraceIdentity): Record<string, string> {
  return Object.fromEntries(Object.entries(runtimeContextOf(id)).map(([k, v]) => [`ai.settings.context.${k}`, v]))
}
```

- [ ] **Step 5: Run the trace-context test**

Run: `cd apps/agents; bunx vitest run tests/observability-trace-context.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing processor test**

`apps/agents/tests/observability-processor.test.ts`:

```ts
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { describe, expect, it, vi } from 'vitest'
import { lazyProcessor, redactingProcessor } from '../agent/lib/observability/processor'

const span = (attributes: Record<string, unknown>) => ({ name: 'chat x', attributes, spanContext: () => ({ traceId: 't', spanId: 's' }) }) as unknown as ReadableSpan
const inner = () => ({ onStart: vi.fn(), onEnd: vi.fn(), forceFlush: vi.fn(async () => {}), shutdown: vi.fn(async () => {}) }) satisfies SpanProcessor

describe('redactingProcessor', () => {
  it('redacts every string attribute and leaves other values and the span alone', () => {
    const next = inner()
    const p = redactingProcessor(next, () => (s) => s.replace('secret', '[redacted]'))
    const original = span({ 'gen_ai.input.messages': 'a secret', 'gen_ai.usage.input_tokens': 3 })
    p.onEnd(original)
    const sent = next.onEnd.mock.calls[0]![0] as ReadableSpan
    expect(sent.attributes).toEqual({ 'gen_ai.input.messages': 'a [redacted]', 'gen_ai.usage.input_tokens': 3 })
    expect(sent.name).toBe('chat x')
    expect(sent.spanContext().traceId).toBe('t')
    expect(original.attributes['gen_ai.input.messages']).toBe('a secret')
  })

  it('holds back content attributes while the rules are not loaded', () => {
    const next = inner()
    const p = redactingProcessor(next, () => null)
    p.onEnd(span({ 'ai.prompt.messages': 'hi', 'gen_ai.output.messages': 'yo', 'ai.toolCall.args': '{}', 'gen_ai.request.model': 'm', 'gen_ai.usage.output_tokens': 1 }))
    expect((next.onEnd.mock.calls[0]![0] as ReadableSpan).attributes).toEqual({ 'gen_ai.request.model': 'm', 'gen_ai.usage.output_tokens': 1 })
  })

  it('redacts string arrays element by element', () => {
    const next = inner()
    redactingProcessor(next, () => (s) => s.toUpperCase()).onEnd(span({ 'ai.response.text': ['a', 'b'] }))
    expect((next.onEnd.mock.calls[0]![0] as ReadableSpan).attributes).toEqual({ 'ai.response.text': ['A', 'B'] })
  })
})

describe('lazyProcessor', () => {
  it('builds the inner processor on first use, once, and forwards every call', async () => {
    const next = inner()
    const create = vi.fn(() => next)
    const p = lazyProcessor(create)
    expect(create).not.toHaveBeenCalled()
    p.onEnd(span({}))
    p.onEnd(span({}))
    await p.forceFlush()
    await p.shutdown()
    expect(create).toHaveBeenCalledTimes(1)
    expect(next.onEnd).toHaveBeenCalledTimes(2)
    expect(next.forceFlush).toHaveBeenCalled()
    expect(next.shutdown).toHaveBeenCalled()
  })
  it('is a no-op when unconfigured', async () => {
    const p = lazyProcessor(() => null)
    expect(() => p.onEnd(span({}))).not.toThrow()
    await expect(p.forceFlush()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd apps/agents; bunx vitest run tests/observability-processor.test.ts`
Expected: FAIL, the module doesn't exist.

- [ ] **Step 8: Implement `processor.ts`**

`apps/agents/agent/lib/observability/processor.ts`:

```ts
import type { Context } from '@opentelemetry/api'
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { PostHogSpanProcessor } from '@posthog/ai/otel'
import { posthogConfig } from '@repo/observability/config'
import { fetchRedactionRules, redactText, type RedactionRules } from '@repo/twin/redact'
import { getEnv } from '../env'
import { ttlCache } from '../ttl-cache'

type Redactor = (text: string) => string

/** Attribute keys that carry prompts, replies or tool payloads; held back until the redaction rules load. */
const CONTENT_KEY = /prompt|message|response|instruction|input|output|args|arguments|result|content|text/i

/** A span processor built on first use: eve evaluates instrumentation modules at build time, without env. */
export function lazyProcessor(create: () => SpanProcessor | null): SpanProcessor {
  let resolved: SpanProcessor | null | undefined
  const get = () => (resolved === undefined ? (resolved = create()) : resolved)
  return {
    onStart: (span: Span, parent: Context) => get()?.onStart(span, parent),
    onEnd: (span: ReadableSpan) => get()?.onEnd(span),
    forceFlush: async () => {
      await get()?.forceFlush()
    },
    shutdown: async () => {
      await get()?.shutdown()
    },
  }
}

/**
 * Forwards each ended span with its string attributes passed through the redactor (the same rules
 * as the stored transcripts), so PostHog holds nothing the twin's own database wouldn't. While the
 * rules are unavailable the redactor is null and content attributes are dropped, never sent raw.
 */
export function redactingProcessor(inner: SpanProcessor, redactor: () => Redactor | null): SpanProcessor {
  const clean = (attributes: ReadableSpan['attributes']) => {
    const redact = redactor()
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(attributes)) {
      const isText = typeof value === 'string' || (Array.isArray(value) && value.some((v) => typeof v === 'string'))
      if (!isText) out[key] = value
      else if (redact) out[key] = Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? redact(v) : v)) : redact(value as string)
      else if (!CONTENT_KEY.test(key)) out[key] = value
    }
    return out as ReadableSpan['attributes']
  }
  return {
    onStart: (span, parent) => inner.onStart(span, parent),
    // A prototype-linked view: every other ReadableSpan member (context, times, events) stays the original's.
    onEnd: (span) => inner.onEnd(Object.create(span, { attributes: { value: clean(span.attributes), enumerable: true } }) as ReadableSpan),
    forceFlush: () => inner.forceFlush(),
    shutdown: () => inner.shutdown(),
  }
}

let rules: RedactionRules | null = null
const loadRules = ttlCache(() => fetchRedactionRules(getEnv().CMS_URL, getEnv().TWIN_REDACT_SECRET), 5 * 60_000)

/** Refreshes the rules in the background (TTL-cached); a failure keeps the last good rules. */
const refreshRules = () => {
  loadRules().then(
    (next) => {
      rules = next
    },
    () => {},
  )
}

/** The current redactor: the CMS rules plus the prompt canary; null until the rules first load. */
function currentRedactor(): Redactor | null {
  refreshRules()
  if (!rules) return null
  const loaded = rules
  const canary = getEnv().TWIN_PROMPT_CANARY
  return (text) => redactText(text, loaded).split(canary).join('[canary]')
}

/** The PostHog LLM-analytics destination: redacted, lazy, and a no-op without a token. */
export function postHogProcessor(): SpanProcessor {
  return lazyProcessor(() => {
    const config = posthogConfig()
    if (!config) return null
    refreshRules() // prefetch, so the first turn's content isn't held back
    return redactingProcessor(new PostHogSpanProcessor({ projectToken: config.token, host: config.ingestHost }), currentRedactor)
  })
}
```

Check `fetchRedactionRules`'s real signature in `packages/twin/src/redact/rules.ts`. It is used as `fetchRedactionRules(env.CMS_URL, env.TWIN_REDACT_SECRET)` in `transcript.ts`; match that.

- [ ] **Step 9: Run the processor test**

Run: `cd apps/agents; bunx vitest run tests/observability-processor.test.ts`
Expected: PASS (5 tests). The test never calls `postHogProcessor`, so there is no network.

- [ ] **Step 10: The two instrumentation files**

`apps/agents/agent/instrumentation/otel.ts`:

```ts
import { otel } from 'eve/instrumentation/otel'

/**
 * Process-wide OTel capture ceiling: record prompts and replies so PostHog shows full chat traces.
 * The PostHog destination redacts them with the transcript's rules (lib/observability/processor.ts).
 * Lifecycle providers (spend.ts, errors.ts) keep their own policies.
 */
export default otel({
  functionId: 'portfolio-twin',
  tracePolicy: () => ({ emit: true, recordInputs: true, recordOutputs: true }),
})
```

`apps/agents/agent/instrumentation/posthog.ts`:

```ts
import { otelIntegration } from 'eve/instrumentation/otel'
import type { Principal } from '../lib/identity'
import { postHogProcessor } from '../lib/observability/processor'
import { runtimeContextOf, traceIdentity } from '../lib/observability/trace-context'

/**
 * Sends eve's trace tree (turn → step → model call → tool → MCP call) to PostHog LLM analytics.
 * Each model attempt is stamped with the visitor's PostHog identity, so traces join their pageviews.
 */
export default otelIntegration({
  spanProcessors: [postHogProcessor()],
  runtimeContext: ({ session }) => runtimeContextOf(traceIdentity(session.auth.current as Principal | null, session.id)),
})
```

If `session.auth.current`'s type isn't assignable to `Principal`, keep the cast through `unknown` and add a comment: eve's `SessionAuthContext` carries `principalId` and `attributes` like `Principal`. Confirm by reading `SessionAuthContext` in eve's `dist/src/public/channels/auth*.d.ts`.

- [ ] **Step 11: Verify eve picks the files up**

Run: `cd apps/agents; bun run info`
Expected: the output lists instrumentation entries `otel`, `posthog`, `spend` (and later `errors`) without errors. If `eve info` doesn't list instrumentation, run `bun run build` instead and confirm it succeeds.

- [ ] **Step 12: Run the agents suite and type-check**

Run: `cd apps/agents; bun run test`
Expected: all pass.
Run: `cd apps/agents; bun run check-types`
Expected: exits 0.

- [ ] **Step 13: Commit**

```bash
git add apps/agents packages/twin bun.lock
```
```bash
git commit -m "feat(agents): eve traces go to PostHog LLM analytics, redacted and tied to the visitor"
```

---

### Task 9: Classifier generations and MCP client spans

**Files:**
- Create: `apps/agents/agent/lib/observability/spans.ts`
- Modify: `apps/agents/agent/lib/payload-mcp.ts`, `apps/agents/agent/lib/abuse.ts`, `apps/agents/agent/lib/intent/classify.ts`, `apps/agents/agent/lib/intent/evaluate.ts`, `apps/agents/agent/channels/eve.ts`, `apps/agents/agent/hooks/conversation.ts`
- Test: `apps/agents/tests/observability-spans.test.ts`, plus the existing `tests/payload-mcp.test.ts`

- [ ] **Step 1: Write the failing spans test**

`apps/agents/tests/observability-spans.test.ts`:

```ts
import { context, propagation, trace } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { generationSpan, inSpan, traceMeta } from '../agent/lib/observability/spans'

const exporter = new InMemorySpanExporter()
beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  propagation.setGlobalPropagator(new W3CTraceContextPropagator())
  trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }))
})
afterAll(() => {
  trace.disable()
  context.disable()
  propagation.disable()
})
beforeEach(() => exporter.reset())

describe('inSpan', () => {
  it('records a span with attributes, and an error status on failure', async () => {
    await inSpan('tools/call twinSearch', { 'gen_ai.tool.name': 'twinSearch' }, async () => 1)
    await expect(inSpan('tools/call twinDisclose', {}, async () => { throw new TypeError('nope') })).rejects.toThrow('nope')
    const [ok, failed] = exporter.getFinishedSpans()
    expect(ok!.attributes['gen_ai.tool.name']).toBe('twinSearch')
    expect(failed!.status.code).toBe(2)
    expect(failed!.attributes['error.type']).toBe('TypeError')
  })

  it('exposes the active trace as an MCP _meta traceparent', async () => {
    let meta: Record<string, string> | undefined
    await inSpan('outer', {}, async () => {
      meta = traceMeta()
    })
    const [span] = exporter.getFinishedSpans()
    expect(meta?.traceparent).toBe(`00-${span!.spanContext().traceId}-${span!.spanContext().spanId}-01`)
  })
})

describe('generationSpan', () => {
  it('records a gen_ai chat span with model, usage and identity', async () => {
    const result = await generationSpan('twin.gate', 'openai/gpt-4.1-mini', { distinctId: 'd-1', conversationId: 'eve-1', replaySessionId: null }, async () => ({
      usage: { inputTokens: 10, outputTokens: 2 },
      response: { modelId: 'openai/gpt-4.1-mini-2025' },
      output: 'ok',
    }))
    expect(result.output).toBe('ok')
    const [span] = exporter.getFinishedSpans()
    expect(span!.name).toBe('chat openai/gpt-4.1-mini')
    expect(span!.attributes).toMatchObject({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'openrouter',
      'gen_ai.request.model': 'openai/gpt-4.1-mini',
      'gen_ai.response.model': 'openai/gpt-4.1-mini-2025',
      'gen_ai.usage.input_tokens': 10,
      'gen_ai.usage.output_tokens': 2,
      'gen_ai.agent.name': 'twin.gate',
      'ai.settings.context.distinctId': 'd-1',
      'ai.settings.context.sessionId': 'eve-1',
    })
  })
})
```

`@opentelemetry/core` and `@opentelemetry/context-async-hooks` are needed for the test. Check `ls node_modules/.bun | grep -E "opentelemetry\+(core|context-async-hooks)@"`, then add them to `apps/agents` `devDependencies` at the installed versions and run `bun install`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/agents; bunx vitest run tests/observability-spans.test.ts`
Expected: FAIL, the module doesn't exist.

- [ ] **Step 3: Implement `spans.ts`**

`apps/agents/agent/lib/observability/spans.ts`:

```ts
import { context, propagation, SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api'
import { contextAttributes, type TraceIdentity } from './trace-context'

/** eve registers the global tracer provider; outside it (unit tests, scripts) these spans are no-ops. */
const tracer = () => trace.getTracer('portfolio-twin')

/** Runs `fn` inside an active span; a throw marks the span failed and is rethrown unchanged. */
export function inSpan<T>(name: string, attributes: Attributes, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span)
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error))
      span.setStatus({ code: SpanStatusCode.ERROR })
      span.setAttribute('error.type', error instanceof Error ? error.name : 'Error')
      throw error
    } finally {
      span.end()
    }
  })
}

/** The active trace as MCP `_meta` (W3C traceparent), so the server's span joins the caller's trace. */
export function traceMeta(): Record<string, string> | undefined {
  const carrier: Record<string, string> = {}
  propagation.inject(context.active(), carrier)
  return carrier.traceparent ? { traceparent: carrier.traceparent } : undefined
}

/**
 * Wraps a direct AI SDK call (the gate and intent classifiers run outside eve's model loop) in a
 * gen_ai chat span, which PostHog turns into an `$ai_generation` in the visitor's conversation.
 */
export function generationSpan<R extends { usage?: { inputTokens?: number; outputTokens?: number }; response?: { modelId?: string } }>(
  functionId: string,
  modelId: string,
  identity: TraceIdentity | undefined,
  run: () => Promise<R>,
): Promise<R> {
  const attributes: Attributes = {
    'gen_ai.operation.name': 'chat',
    'gen_ai.provider.name': 'openrouter',
    'gen_ai.request.model': modelId,
    'gen_ai.agent.name': functionId,
    ...(identity ? contextAttributes(identity) : {}),
  }
  return inSpan(`chat ${modelId}`, attributes, async (span) => {
    const result = await run()
    // Optional reads: test doubles of generateText often omit usage and response.
    span.setAttributes({
      'gen_ai.response.model': result.response?.modelId ?? modelId,
      'gen_ai.usage.input_tokens': result.usage?.inputTokens ?? 0,
      'gen_ai.usage.output_tokens': result.usage?.outputTokens ?? 0,
    })
    return result
  })
}
```

- [ ] **Step 4: Run the spans test**

Run: `cd apps/agents; bunx vitest run tests/observability-spans.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Instrument `callPayloadTool`**

In `payload-mcp.ts`, import `{ inSpan, traceMeta }` from `./observability/spans`. Wrap the body after `const env = getEnv()` like this, keeping the existing logic inside:

```ts
  return inSpan(`tools/call ${name}`, { 'mcp.method.name': 'tools/call', 'gen_ai.operation.name': 'execute_tool', 'gen_ai.tool.name': name }, async (span) => {
    const client = new Client({ name: 'portfolio-twin', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(env.PAYLOAD_MCP_URL), {
      requestInit: { headers: { Authorization: `Bearer ${env.PAYLOAD_MCP_API_KEY}` } },
    })
    try {
      await client.connect(transport, { timeout: PAYLOAD_MCP_TIMEOUT_MS })
      if (transport.sessionId) span.setAttribute('mcp.session.id', transport.sessionId)
      const meta = traceMeta()
      const result = await client.callTool({ name, arguments: args, ...(meta ? { _meta: meta } : {}) }, undefined, { timeout: PAYLOAD_MCP_TIMEOUT_MS })
      // …the existing isError / Content / text / schema.parse lines, unchanged…
    } finally {
      await client.close()
    }
  })
```

Update the JSDoc to mention that each call is one `tools/call` span carrying a traceparent for the server.

- [ ] **Step 6: Run the MCP client tests**

Run: `cd apps/agents; bunx vitest run tests/payload-mcp.test.ts`
Expected: PASS unchanged. Without a registered provider, `traceMeta()` returns undefined, so no `_meta` is sent and the stub's expectations hold. If a test asserts the exact request params, it still passes, because `_meta` is absent.

- [ ] **Step 7: Instrument the classifiers**

`abuse.ts`: import `generationSpan` and `type TraceIdentity`. Add a 4th parameter `trace?: TraceIdentity` to `classifyMessage`, and replace the `generateText` call:

```ts
    const model = classifierModel()
    const { output } = await generationSpan('twin.gate', modelIdOf(model), trace, () =>
      generateText({
        model,
        instructions: GATE_SYSTEM,
        prompt: gatePrompt(text, previous),
        output: Output.object({ schema: GateDecision }),
        abortSignal: signal,
        maxRetries: 0, // the timeout decides the fallback
      }),
    )
```

Add `modelIdOf` to `spans.ts` and export it:

```ts
/** A model's id whether the AI SDK was handed a string or a provider model object. */
export function modelIdOf(model: string | { modelId: string }): string {
  return typeof model === 'string' ? model : model.modelId
}
```

Make the same change in `intent/classify.ts` `classifyIntent(turns, timeoutMs, trace?: TraceIdentity)` with functionId `'twin.intent'` and `intentClassifierModel()`.

`intent/evaluate.ts`: add a 4th parameter `trace?: TraceIdentity` to `evaluateCallIntent` and pass it to `classifyIntent`.

`channels/eve.ts`: compute `traceIdentity(auth, sessionId)` (import from `../lib/observability/trace-context`) and pass it as the 4th argument to `classifyMessage`. Read `defaultEveAuth`'s return type first. If it is a `Principal`-shaped object (as `ensureConversation(sessionId, auth)` implies), pass it directly.

`hooks/conversation.ts`: at the `evaluateCallIntent(ctx.session.id, …)` call, pass `traceIdentity(ctx.session.auth.current as Principal | null, ctx.session.id)`. Follow how the same file already reads the principal for `ensureConversation`, and reuse that expression.

- [ ] **Step 8: Run the agents suite and type-check**

Run: `cd apps/agents; bun run test`
Expected: all pass. `generationSpan` reads `usage` and `response` optionally, so existing `generateText` mocks keep working.
Run: `cd apps/agents; bun run check-types`
Expected: exits 0.

- [ ] **Step 9: Commit**

```bash
git add apps/agents bun.lock
```
```bash
git commit -m "feat(agents): classifier generations and Payload MCP calls are traced spans"
```

---

### Task 10: Agent errors to Error Tracking

**Files:**
- Create: `apps/agents/agent/instrumentation/errors.ts`, `apps/agents/agent/lib/observability/errors.ts`
- Test: `apps/agents/tests/observability-errors.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/agents/tests/observability-errors.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { reportAgentFailure } from '../agent/lib/observability/errors'

describe('reportAgentFailure', () => {
  it('reports a failure with its session, turn and kind', () => {
    const capture = vi.fn()
    reportAgentFailure(capture, 'turn', { error: new Error('x'), sessionId: 's-1', turnId: 't-1' })
    expect(capture).toHaveBeenCalledWith(expect.any(Error), { distinctId: 'twin-agent', properties: { kind: 'turn', sessionId: 's-1', turnId: 't-1' } })
  })
  it('wraps a non-Error cause so the stack view still works', () => {
    const capture = vi.fn()
    reportAgentFailure(capture, 'model', { error: 'rate limited', sessionId: 's-1' })
    const [error] = capture.mock.calls[0]!
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('rate limited')
  })
  it('skips actions that were rejected, cancelled or abandoned', () => {
    const capture = vi.fn()
    reportAgentFailure(capture, 'action', { error: new Error('x'), sessionId: 's-1', outcome: 'cancelled' })
    expect(capture).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/agents; bunx vitest run tests/observability-errors.test.ts`
Expected: FAIL, the module doesn't exist.

- [ ] **Step 3: Implement the helper and the instrumentation**

`apps/agents/agent/lib/observability/errors.ts`:

```ts
import type { captureServerError } from '@repo/observability/server'

type Capture = typeof captureServerError

/** What every eve failure event shares, reduced to what the report needs. */
export interface FailureFacts {
  error?: unknown
  sessionId: string
  turnId?: string
  /** Action outcome; only `failure` is a bug (rejections and cancellations are normal flow). */
  outcome?: string
}

/**
 * Reports one agent failure to Error Tracking under a single service identity: these are bugs for
 * the owner to fix, found by session id, not visitor analytics.
 */
export function reportAgentFailure(capture: Capture, kind: 'turn' | 'session' | 'model' | 'action', facts: FailureFacts): void {
  if (kind === 'action' && facts.outcome !== 'failure') return
  const error = facts.error instanceof Error ? facts.error : new Error(String(facts.error ?? `${kind} failed`))
  capture(error, { distinctId: 'twin-agent', properties: { kind, sessionId: facts.sessionId, ...(facts.turnId ? { turnId: facts.turnId } : {}) } })
}
```

`apps/agents/agent/instrumentation/errors.ts`:

```ts
import { captureServerError, serverPostHog } from '@repo/observability/server'
import { defineInstrumentation } from 'eve/instrumentation'
import { reportAgentFailure } from '../lib/observability/errors'

/**
 * Turn, session, model and tool failures go to PostHog Error Tracking. Outputs are recorded only
 * because error details are an output; nothing here reads prompts or replies.
 */
export default defineInstrumentation({
  tracePolicy: () => ({ emit: true, recordInputs: false, recordOutputs: true }),
  events: {
    'turn.failed': (e) => reportAgentFailure(captureServerError, 'turn', { error: e.error, sessionId: e.sessionId, turnId: e.turnId }),
    'session.failed': (e) => reportAgentFailure(captureServerError, 'session', { error: e.error, sessionId: e.sessionId, turnId: e.turnId }),
    'model.call.failed': (e) => reportAgentFailure(captureServerError, 'model', { error: e.error, sessionId: e.scope.sessionId, turnId: e.scope.turnId }),
    'action.failed': (e) => reportAgentFailure(captureServerError, 'action', { error: e.error, sessionId: e.scope.sessionId, turnId: e.scope.turnId, outcome: e.outcome }),
  },
  flush: () => serverPostHog().flush(),
})
```

Confirm `flush` is a valid `defineInstrumentation` key by reading `InstrumentationDefinition` in eve's `dist/src/public/instrumentation/*.d.ts`. The docs name it ("Use `flush` to drain buffered records"). If its signature differs (for example, it takes a context), adapt to it.

- [ ] **Step 4: Run the tests, type-check and build**

Run: `cd apps/agents; bunx vitest run tests/observability-errors.test.ts`
Expected: PASS (3 tests).
Run: `cd apps/agents; bun run check-types`
Expected: exits 0.
Run: `cd apps/agents; bun run build`
Expected: the eve build succeeds with no env set. This proves that nothing reads env at module load.

- [ ] **Step 5: Commit**

```bash
git add apps/agents
```
```bash
git commit -m "feat(agents): turn, session, model and tool failures reach PostHog Error Tracking"
```

---

### Task 11: Payload MCP server tracing and CMS errors

**Files:**
- Create: `apps/payload/src/mcp/observability.ts`, `apps/payload/src/instrumentation.ts`
- Modify: `apps/payload/src/mcp/mcp-plugin.ts`, `apps/payload/package.json`
- Test: `apps/payload/tests/int/mcp-observability.int.spec.ts`. First check `apps/payload/vitest.config.mts` `include` and use its naming pattern.

- [ ] **Step 1: Dependency**

Add `"@repo/observability": "*"` to `apps/payload/package.json` `dependencies`, then run `bun install`. If the Payload Next build fails to resolve the TS source later, add `transpilePackages: ['@repo/observability']` to `apps/payload/next.config.ts`. Check how `@repo/twin` resolves there first; mirror it.

- [ ] **Step 2: Write the failing test**

Use the include pattern from `vitest.config.mts`. Content:

```ts
import { describe, expect, it, vi } from 'vitest'
import { mcpEventToCapture } from '../../src/mcp/observability'

const TRACE = '0af7651916cd43dd8448eb211c80319c'
const SPAN = 'b7ad6b7169203331'

describe('mcpEventToCapture', () => {
  it('turns a completed tools/call into an $ai_span joined to the caller trace', () => {
    const c = mcpEventToCapture({
      type: 'REQUEST_COMPLETED', timestamp: 0, sessionId: 'mcp-s', requestId: 'r1', method: 'tools/call', status: 'success', duration: 120,
      parameters: { name: 'twinSearch', arguments: { query: 'react' }, _meta: { traceparent: `00-${TRACE}-${SPAN}-01` } },
      result: { content: [{ type: 'text', text: '{"hits":[]}' }] },
    })
    expect(c).toEqual({
      distinctId: 'mcp:payload',
      event: '$ai_span',
      properties: {
        $ai_trace_id: TRACE,
        $ai_parent_id: SPAN,
        $ai_span_name: 'mcp tools/call twinSearch',
        $ai_session_id: 'mcp-s',
        $ai_latency: 0.12,
        $ai_is_error: false,
        $ai_input_state: { query: 'react' },
        $ai_output_state: { content: [{ type: 'text', text: '{"hits":[]}' }] },
        mcp_tool: 'twinSearch',
      },
    })
  })

  it('uses the MCP session (or request) as its own trace without a traceparent, and flags errors', () => {
    const c = mcpEventToCapture({ type: 'REQUEST_COMPLETED', timestamp: 0, requestId: 'r2', method: 'tools/call', status: 'error', parameters: { name: 'twinDisclose', arguments: {} } })
    expect(c?.properties).toMatchObject({ $ai_trace_id: 'mcp-r2', $ai_is_error: true })
    expect(c?.properties).not.toHaveProperty('$ai_parent_id')
  })

  it('truncates large outputs', () => {
    const c = mcpEventToCapture({ type: 'REQUEST_COMPLETED', timestamp: 0, requestId: 'r3', method: 'tools/call', status: 'success', parameters: { name: 'x', arguments: {} }, result: 'y'.repeat(20_000) })
    expect(String(c?.properties.$ai_output_state).length).toBeLessThanOrEqual(8_192 + 20)
  })

  it('counts other methods as mcp_request and ignores received/session events', () => {
    expect(mcpEventToCapture({ type: 'REQUEST_COMPLETED', timestamp: 0, method: 'tools/list', status: 'success' })).toEqual({ distinctId: 'mcp:payload', event: 'mcp_request', properties: { method: 'tools/list', status: 'success' } })
    expect(mcpEventToCapture({ type: 'REQUEST_RECEIVED', timestamp: 0, method: 'tools/call', status: 'success' })).toBeNull()
    expect(mcpEventToCapture({ type: 'SESSION_STARTED', timestamp: 0, transport: 'HTTP' })).toBeNull()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/payload; bunx vitest run --config vitest.config.mts <the test path>`
Expected: FAIL, the module doesn't exist.

- [ ] **Step 4: Implement `observability.ts` and wire it in**

`apps/payload/src/mcp/observability.ts`:

```ts
import { captureServerError, serverPostHog } from '@repo/observability/server'

/** mcp-handler 1.1's `onEvent` payload (its `McpEvent` union isn't exported from the package root). */
type McpEvent =
  | { type: 'SESSION_STARTED' | 'SESSION_ENDED'; timestamp: number; sessionId?: string; transport: 'SSE' | 'HTTP' }
  | { type: 'REQUEST_RECEIVED' | 'REQUEST_COMPLETED'; timestamp: number; sessionId?: string; requestId?: string; method: string; parameters?: unknown; result?: unknown; duration?: number; status: 'success' | 'error' }
  | { type: 'ERROR'; timestamp: number; sessionId?: string; requestId?: string; error: Error | string; context?: string; source: string; severity: string }

const MAX_OUTPUT = 8_192
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/

/** Big tool results (search corpora) are cut so one event can't blow past PostHog's size limits. */
const truncated = (value: unknown): unknown => {
  const json = JSON.stringify(value)
  return json && json.length > MAX_OUTPUT ? `${json.slice(0, MAX_OUTPUT)}…[truncated]` : value
}

/**
 * The PostHog event for one MCP event, or null when it isn't reported. A `tools/call` becomes an
 * `$ai_span`; with the caller's `_meta.traceparent` (the twin sends one) it nests under the
 * caller's trace, otherwise the MCP session or request is its own trace (Claude Code, other clients).
 */
export function mcpEventToCapture(event: McpEvent): { distinctId: string; event: string; properties: Record<string, unknown> } | null {
  if (event.type !== 'REQUEST_COMPLETED') return null
  if (event.method !== 'tools/call') return { distinctId: 'mcp:payload', event: 'mcp_request', properties: { method: event.method, status: event.status } }
  const params = (event.parameters ?? {}) as { name?: string; arguments?: unknown; _meta?: { traceparent?: string } }
  const parent = TRACEPARENT.exec(params._meta?.traceparent ?? '')
  const tool = params.name ?? 'unknown'
  return {
    distinctId: 'mcp:payload',
    event: '$ai_span',
    properties: {
      $ai_trace_id: parent?.[1] ?? `mcp-${event.sessionId ?? event.requestId ?? event.timestamp}`,
      ...(parent ? { $ai_parent_id: parent[2] } : {}),
      $ai_span_name: `mcp tools/call ${tool}`,
      ...(event.sessionId ? { $ai_session_id: event.sessionId } : {}),
      ...(event.duration !== undefined ? { $ai_latency: event.duration / 1000 } : {}),
      $ai_is_error: event.status === 'error',
      $ai_input_state: params.arguments ?? {},
      ...(event.result !== undefined ? { $ai_output_state: truncated(event.result) } : {}),
      mcp_tool: tool,
    },
  }
}

/** `mcp.handlerOptions.onEvent`: reports MCP traffic and errors; never throws into the handler. */
export function mcpOnEvent(event: McpEvent): void {
  try {
    if (event.type === 'ERROR') {
      captureServerError(event.error instanceof Error ? event.error : new Error(String(event.error)), {
        distinctId: 'mcp:payload',
        properties: { source: event.source, severity: event.severity, context: event.context },
      })
      return
    }
    const capture = mcpEventToCapture(event)
    if (capture) serverPostHog().capture(capture)
  } catch (error) {
    console.warn('[mcp] observability failed', error instanceof Error ? error.message : error)
  }
}
```

Adjust the test's expected properties to the exact output. In the first test, `$ai_session_id: 'mcp-s'` is present and `$ai_latency: 0.12`. The keys asserted with `toEqual` must match the object's keys exactly, which they do here.

`mcp-plugin.ts`: import `{ mcpOnEvent }` from `./observability` and change the `mcp` option:

```ts
  mcp: { tools: twinTools, handlerOptions: { onEvent: mcpOnEvent } },
```

If `MCPHandlerOptions`' `onEvent` type doesn't accept `mcpOnEvent` (a different event type name), annotate `mcpOnEvent`'s parameter with the plugin's own type: `NonNullable<NonNullable<PluginMCPServerConfig['mcp']>['handlerOptions']>['onEvent']`. Find that in `@payloadcms/plugin-mcp/dist/types.d.ts` line ~140, and keep the local union only for the test.

`apps/payload/src/instrumentation.ts`:

```ts
import type { Instrumentation } from 'next'

/** Admin, API and MCP request errors go to PostHog Error Tracking. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { captureServerError } = await import('@repo/observability/server')
  captureServerError(error, { distinctId: 'cms', properties: { path: request.path, method: request.method, routePath: context.routePath, routeType: context.routeType } })
}
```

- [ ] **Step 5: Run the Payload tests and type-check**

Run: `cd apps/payload; bunx vitest run --config vitest.config.mts`
Expected: all pass. Integration tests may need `test.env`; read the payload README or CLAUDE.md for how they run, and run them the same way.
Run: `cd apps/payload; bunx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/payload bun.lock
```
```bash
git commit -m "feat(cms): MCP tool calls become PostHog spans joined to the caller's trace; CMS errors tracked"
```

---

### Task 12: Configuration and docs

**Files:**
- Modify: `apps/web/.env.example`, `apps/agents/.env.example`, `apps/payload/.env.example`, `.env.deploy.example`, `docker-compose.yml`, `apps/agents/fixtures/offline/.env.example` (leave the token blank there)
- Create: `docs/observability.md`
- Modify: `README.md`, with a link to the doc if the README has a docs list

- [ ] **Step 1: Env examples**

Append to `apps/web/.env.example`, `apps/agents/.env.example` and `apps/payload/.env.example`:

```bash
# --- PostHog (analytics, replay, web vitals, errors, LLM traces) ---
# Public project token (phc_…). Blank disables all capture (dev, tests, CI).
POSTHOG_PROJECT_TOKEN=
# PostHog Cloud region: us or eu.
POSTHOG_REGION=us
```

Also append to `apps/web/.env.example`:

```bash
# Public origin for canonical URLs, sitemap and Open Graph (no trailing slash).
SITE_URL=http://localhost:3000
# Optional Google Search Console verification token (the content of its meta tag).
GOOGLE_SITE_VERIFICATION=
```

- [ ] **Step 2: Compose and deploy template**

In `docker-compose.yml`, add to the `environment` of `cms`, `web` and `agents`:

```yaml
      POSTHOG_PROJECT_TOKEN: ${POSTHOG_PROJECT_TOKEN:-}
      POSTHOG_REGION: ${POSTHOG_REGION:-us}
```

Add to `web` only:

```yaml
      SITE_URL: ${WEB_PUBLIC_URL:?set WEB_PUBLIC_URL}
      GOOGLE_SITE_VERIFICATION: ${GOOGLE_SITE_VERIFICATION:-}
```

In `.env.deploy.example`, add a commented PostHog block with `POSTHOG_PROJECT_TOKEN=`, `POSTHOG_REGION=us` and `GOOGLE_SITE_VERIFICATION=`, in the file's existing comment style.

- [ ] **Step 3: Write `docs/observability.md`**

Sections, all with real content:

1. **What is captured and where.** A table: web analytics, web vitals, replay, error tracking, LLM traces, MCP spans, each mapped to its source file.
2. **Setup.**
   - Create the PostHog project. Copy the project token into `POSTHOG_PROJECT_TOKEN` for `web`, `agents` and `cms`, and set `POSTHOG_REGION`.
   - Project settings to turn on:
     - Web vitals autocapture (Settings → Autocapture)
     - Exception autocapture (Settings → Error tracking)
     - Session replay, with "Mask all inputs" on
     - "Discard client IP data"
   - Search Console: add the property for `SITE_URL`, then put the token in `GOOGLE_SITE_VERIFICATION`. Submit `<SITE_URL>/sitemap.xml`.
3. **Event catalog.** Copy the table from the spec's "Event catalog" section, verbatim and updated to what was built.
4. **Conversions.** Create these PostHog actions:
   - "Booked a call" = `booking_completed`
   - "Emailed" = `outbound_click` where `kind = mailto`
   - "Opened resume" = `os_app_opened` where `app = resume`
   - "Chatted" = `twin_message_sent`
5. **Recommended dashboard.**
   - Web analytics (built in)
   - Trends of `section_viewed` by `section`
   - Funnel: `$pageview` → `section_viewed` work → `outbound_click`
   - Conversions trend
   - Web vitals p75 LCP/INP/CLS by `$pathname` and `$device_type`
   - Error tracking issues
   - LLM analytics: cost per day, p95 latency, error rate, generations by `gen_ai.agent.name`
   - `$ai_span` count by `mcp_tool`
6. **Reading a twin trace.**
   - Open LLM analytics → Traces and filter by person.
   - The tree: `invoke_agent` → `agent.step` → `chat <model>` → `execute_tool` → `tools/call twinSearch` → `mcp tools/call twinSearch` (from the CMS).
   - `$session_id` on generations links to the replay.
7. **Privacy.**
   - Prompts and replies are redacted with the twin's rules and the canary is scrubbed before export.
   - `respect_dnt`, inputs masked, no identify calls.
   - The switch for a consent banner is `cookieless_mode: 'on_reject'` in `apps/web/lib/analytics/init.ts`.
8. **Local testing.** Set a token from a dev PostHog project in `apps/web/.env.local` and `apps/agents/.env`. The relay is at `http://localhost:3100/relay` in a worktree.

- [ ] **Step 4: Run all type-checks**

Run: `bun run check-types`
Expected: turbo runs check-types for every workspace and all pass. If `@repo/observability` needs a turbo task entry, it inherits it from the root `turbo.json` `check-types` task automatically, because it defines the script.

- [ ] **Step 5: Commit**

```bash
git add docs/observability.md docker-compose.yml .env.deploy.example apps/web/.env.example apps/agents/.env.example apps/payload/.env.example README.md
```
```bash
git commit -m "docs: observability setup, event catalog, dashboards and env wiring"
```

---

### Task 13: E2E analytics spec and real-browser verification

**Files:**
- Create: `apps/web/tests/e2e/analytics.spec.ts`

The spec needs the dev server started **with** `POSTHOG_PROJECT_TOKEN=phc_e2e_fake` and `SITE_URL=http://localhost:3100`. All `/relay/**` traffic is intercepted in the browser, so nothing reaches PostHog.

- [ ] **Step 1: Write the spec**

`apps/web/tests/e2e/analytics.spec.ts`:

```ts
import { gunzipSync } from 'node:zlib'
import { expect, test, type Request } from '@playwright/test'
import { openPortfolio } from './support'

/** posthog-js batches events as gzip (`compression=gzip-js`) or plain JSON; both decode to an array or `{ batch }`. */
function eventsOf(request: Request): Array<{ event: string; properties: Record<string, unknown> }> {
  const body = request.postDataBuffer()
  if (!body) return []
  let text: string
  try {
    text = gunzipSync(body).toString('utf8')
  } catch {
    text = body.toString('utf8')
  }
  try {
    const parsed = JSON.parse(text) as unknown
    const list = Array.isArray(parsed) ? parsed : ((parsed as { batch?: unknown[] }).batch ?? [parsed])
    return list as Array<{ event: string; properties: Record<string, unknown> }>
  } catch {
    return []
  }
}

test.describe('analytics and SEO', () => {
  test.skip(!process.env.POSTHOG_PROJECT_TOKEN, 'needs the dev server started with a (fake) POSTHOG_PROJECT_TOKEN')

  test('posthog-js reports through the first-party relay', async ({ page }) => {
    const events: Array<{ event: string; properties: Record<string, unknown> }> = []
    await page.route('**/relay/**', async (route) => {
      events.push(...eventsOf(route.request()))
      const url = route.request().url()
      await route.fulfill(url.includes('/array/') || url.includes('/static/') ? { status: 200, contentType: 'application/javascript', body: '' } : { status: 200, contentType: 'application/json', body: '{}' })
    })
    await openPortfolio(page)
    const contact = page.getByRole('navigation', { name: 'Contact' }).getByRole('link').first()
    // keep the outbound tab from opening
    await contact.evaluate((a) => a.addEventListener('click', (e) => e.preventDefault()))
    await contact.click()
    await expect.poll(() => events.map((e) => e.event), { timeout: 15_000 }).toEqual(expect.arrayContaining(['$pageview', 'outbound_click']))
    const outbound = events.find((e) => e.event === 'outbound_click')!
    expect(outbound.properties).toMatchObject({ kind: expect.stringMatching(/external|mailto/) })
  })

  test('home has canonical, JSON-LD, and robots/sitemap are served', async ({ page, request }) => {
    await page.goto('/')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$/)
    const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}') as { '@graph': Array<{ '@type': string }> }
    expect(jsonLd['@graph'].map((n) => n['@type'])).toEqual(['Person', 'WebSite'])
    expect(await page.locator('main footer').count()).toBe(0)
    expect((await request.get('/robots.txt')).status()).toBe(200)
    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.status()).toBe(200)
    expect(await sitemap.text()).toContain('<loc>')
  })
})
```

- [ ] **Step 2: Start the stack for the worktree**

Ports: the main checkout owns 3000/3001. This worktree runs web on 3100 against the shared, read-only CMS on 3001. Check the CMS is up with `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/site-settings`. If it is not running, say so and start nothing in the main checkout. Instead, start the worktree's own CMS against a *copy* of the DB, per the memory note, and never on `payload.db` itself.

Start web, as a background terminal task, with PowerShell:

```powershell
$env:PORT='3100'; $env:POSTHOG_PROJECT_TOKEN='phc_e2e_fake'; $env:SITE_URL='http://localhost:3100'; bun run --cwd "D:/Second Brain/01.PROJETOS/applications/my-portfolio/.claude/worktrees/feat-observability/apps/web" dev
```

- [ ] **Step 3: Run the new spec, then the whole e2e suite**

Run (PowerShell): `$env:PORT='3100'; $env:POSTHOG_PROJECT_TOKEN='phc_e2e_fake'; bun run --cwd "<worktree>/apps/web" test:e2e tests/e2e/analytics.spec.ts`
Expected: 2 passed.
Run: the same command without the file argument.
Expected: the whole e2e suite passes. The footer move must not break `layout.spec.ts`; if it does, fix the CSS selector, not the test's intent.

- [ ] **Step 4: Real-browser check (owner's rule: green only after a real E2E)**

Use a Playwright script from `apps/web` (the in-app pane is often hidden) against `http://localhost:3100` and check:
1. A first visit sends a `$pageview`. Scrolling sends `section_viewed` for `work`.
2. A reload (returning visitor, same `ph_` cookie) sends a new `$pageview` with the **same** `distinct_id`.
3. In `/os`, opening Messenger sends `os_app_opened { app: 'messenger' }`, or whatever id `apps.ts` uses. The iframe sends no `$pageview`.
4. If the agents service is running locally (port 4100, `TWIN_AGENT_URL`), send one chat message. Verify that `twin_message_sent` is captured, and that the BFF's upstream JWT carries `ph_did`. Log `decodeJwt` in a quick unit-level check, or inspect with a temporary `console.info` that you remove afterwards. If the agents service isn't running, state that this step was skipped and why.

Save screenshots to the scratchpad. Report the observed event names and properties.

- [ ] **Step 5: Full unit suites one last time**

Run each and confirm it passes:
- `cd apps/web; bunx vitest run`
- `cd apps/agents; bun run test`
- `cd packages/twin; bunx vitest run`
- `cd packages/observability; bunx vitest run`
- `cd apps/payload; bunx vitest run --config vitest.config.mts`

Then run `bun run check-types` from the root.

- [ ] **Step 6: Commit**

```bash
git add apps/web/tests/e2e/analytics.spec.ts
```
```bash
git commit -m "test(web): e2e for the PostHog relay, outbound events, canonical, JSON-LD, robots and sitemap"
```
