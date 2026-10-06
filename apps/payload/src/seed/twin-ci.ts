/**
 * CI-only seed for the live twin evals (`.github/workflows/ci.yml`, job `live-evals`). It runs
 * after `src/seed/run.ts` against a throwaway SQLite database and adds what the twin needs on top
 * of the portfolio content: one public knowledge fact, one `voice` sample, and an MCP API key that
 * may call only the three twin tools. Never point it at a real database: it creates a user.
 *
 * Run with `payload run src/seed/twin-ci.ts` (NODE_ENV=production, so the committed migrations
 * apply instead of a dev schema push). It prints the key after an `::add-mask::` line, and appends
 * `PAYLOAD_MCP_API_KEY=<key>` to `$GITHUB_ENV` when that is set, for the next workflow step.
 */
import configPromise from '@payload-config'
import { randomBytes } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { getPayload } from 'payload'
import { quiet, upsert } from './upsert'

const payload = await getPayload({ config: configPromise })

// The plugin binds every key to a user (`user` is required); this one exists only in the throwaway DB.
const userId = await upsert(payload, 'users', { email: { equals: 'twin-ci@example.com' } }, {
  email: 'twin-ci@example.com',
  name: 'Twin CI',
  password: randomBytes(24).toString('hex'),
})

await upsert(payload, 'knowledge', { topic: { equals: 'Availability' } }, {
  topic: 'Availability',
  category: 'availability' as const,
  answer: "I'm open to staff-level engineering roles and selected freelance projects. My notice period is 30 days.",
  disclosure: 'public' as const,
  order: 0,
})
await upsert(payload, 'knowledge', { topic: { equals: 'Writing sample' } }, {
  topic: 'Writing sample',
  category: 'voice' as const,
  answer: "Short version: I like boring infrastructure and sharp product edges. Happy to dig into either if you're curious.",
  disclosure: 'public' as const,
  order: 0,
})

// Payload's `useAPIKey` auth (which the plugin's collection enables): `apiKey` is stored encrypted
// and `apiKeyIndex` is its HMAC with PAYLOAD_SECRET, both set by Payload's own field hooks. The MCP
// endpoint looks the bearer token up by that index. Collection and global operations default to
// off; custom tools default to on, so the three are set explicitly and nothing else is enabled.
const apiKey = randomBytes(32).toString('hex')
await payload.create({
  collection: 'payload-mcp-api-keys',
  data: {
    user: userId,
    label: 'Portfolio twin (CI)',
    description: 'Throwaway key for the live evals in CI.',
    enableAPIKey: true,
    apiKey,
    'payload-mcp-tool': { twinIdentity: true, twinSearch: true, twinDisclose: true },
  },
  context: quiet,
})

process.stdout.write(`::add-mask::${apiKey}\n`)
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `PAYLOAD_MCP_API_KEY=${apiKey}\n`)
process.stdout.write(`PAYLOAD_MCP_API_KEY=${apiKey}\n`)
payload.logger.info('Twin CI seed complete')
process.exit(0)
