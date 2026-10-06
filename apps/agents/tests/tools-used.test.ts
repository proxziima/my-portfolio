import { createConversation, createVisitor, getConversation } from '@repo/twin/db'
import { createTestDb, type TestDb } from '@repo/twin/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../agent/lib/db', () => ({ db: () => m.db }))
vi.mock('../agent/lib/env', () => ({ getEnv: () => ({ EXA_API_KEY: 'exa-test' }) }))
vi.mock('../agent/lib/tool-gate', () => ({ toolGranted: async () => true }))
vi.mock('exa-js', () => ({
  default: class {
    async search() {
      return { results: [{ title: 'Acme', url: 'https://acme.test', text: 'Acme builds things.' }] }
    }
  },
}))

const { default: webSearch } = await import('../agent/tools/web_search')
const { default: recordCallDecline } = await import('../agent/tools/record_call_decline')

const SESSION = 'sess-tools'
const ctx = { session: { id: SESSION } }

interface Executable {
  execute: (input: unknown, ctx: unknown) => Promise<unknown>
}

/** The tool a dynamic definition offers at `step.started` (both are granted here). */
async function resolve(dynamic: unknown): Promise<Executable> {
  const { events } = dynamic as { events: Record<string, (event: unknown, ctx: unknown) => Promise<unknown>> }
  const tool = await events['step.started']!({}, ctx)
  if (!tool) throw new Error('tool was not offered')
  return tool as Executable
}

let t: TestDb
beforeEach(async () => {
  t = await createTestDb()
  m.db = t.db
  await createConversation(t.db, SESSION, await createVisitor(t.db))
})
afterEach(async () => t.close())

const toolsUsed = async () => (await getConversation(t.db, SESSION))!.state.toolsUsed

describe('toolsUsed', () => {
  it('records web_search once, however often it runs', async () => {
    const tool = await resolve(webSearch)
    await tool.execute({ query: 'acme company' }, ctx)
    await tool.execute({ query: 'acme roles' }, ctx)
    expect(await toolsUsed()).toEqual(['web_search'])
  })

  it('records record_call_decline', async () => {
    const tool = await resolve(recordCallDecline)
    await tool.execute({}, ctx)
    expect(await toolsUsed()).toEqual(['record_call_decline'])
    expect((await getConversation(t.db, SESSION))!.state.callOfferDeclined).toBe(true)
  })
})
