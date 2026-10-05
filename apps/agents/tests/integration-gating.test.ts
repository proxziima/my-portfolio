import { beforeEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const mocks = vi.hoisted(() => ({ getConversation: vi.fn(), callPayloadTool: vi.fn(), putCachedSearch: vi.fn() }))

vi.mock('../agent/lib/env', () => ({ getEnv: () => env.current }))
vi.mock('../agent/lib/db', () => ({ db: () => ({}) }))
vi.mock('../agent/lib/skills/compose', () => ({
  toolsFor: () => ['search_portfolio', 'check_availability', 'schedule_call', 'web_search'],
}))
vi.mock('../agent/lib/payload-mcp', () => ({ callPayloadTool: mocks.callPayloadTool }))
vi.mock('@repo/twin/db', () => ({
  getConversation: mocks.getConversation,
  getCachedSearch: async () => null,
  putCachedSearch: mocks.putCachedSearch,
}))

const { toolGranted } = await import('../agent/lib/tool-gate')
const { searchPortfolio } = await import('../agent/lib/search')

const imessage = {
  SENDBLUE_API_KEY: 'sb-key',
  SENDBLUE_API_SECRET: 'sb-secret',
  SENDBLUE_FROM_NUMBER: '+15550000001',
  SENDBLUE_WEBHOOK_SECRET: 'sb_secret_value_1234',
  OWNER_PHONE_NUMBER: '+5511999998888',
}

beforeEach(() => {
  env.current = {}
  mocks.getConversation.mockResolvedValue({ state: {} })
  mocks.callPayloadTool.mockResolvedValue({
    items: [],
    restricted: [{ sourceId: 'knowledge:salary', topic: 'Compensation', category: 'availability' }],
  })
})

describe('optional integrations', () => {
  it('hides tools whose integration is not configured, without touching the database', async () => {
    for (const tool of ['check_availability', 'schedule_call', 'web_search'] as const)
      expect(await toolGranted('s1', tool)).toBe(false)
    expect(mocks.getConversation).not.toHaveBeenCalled()
  })

  it('offers them once configured', async () => {
    env.current = {
      GOOGLE_SERVICE_ACCOUNT_JSON: { client_email: 'a@b.c', private_key: 'PRIVATE KEY' },
      GOOGLE_CALENDAR_ID: 'c',
      CAL_LINK: 'v/intro',
      CAL_WEBHOOK_SECRET: 's',
      TWIN_BOOKING_REF_SECRET: 'r',
      EXA_API_KEY: 'e',
    }
    for (const tool of ['check_availability', 'schedule_call', 'web_search'] as const)
      expect(await toolGranted('s1', tool)).toBe(true)
  })

  it('keeps tools with no integration available', async () => {
    expect(await toolGranted('s1', 'search_portfolio')).toBe(true)
  })

  it('drops restricted entries before caching when no owner can approve them', async () => {
    const result = await searchPortfolio('s1', 'salary')
    expect(result.restricted).toEqual([])
    expect(mocks.putCachedSearch).toHaveBeenCalledWith({}, 's1', expect.any(String), result)
  })

  it('keeps restricted entries when iMessage is configured', async () => {
    env.current = imessage
    expect((await searchPortfolio('s1', 'salary')).restricted).toHaveLength(1)
  })
})
