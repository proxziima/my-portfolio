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
