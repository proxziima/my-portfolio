import { createTwinDb, type TwinDb } from '@repo/twin/db'
import { defineEvalConfig } from 'eve/evals'
import { startStubs } from '../stubs/start'

/** What every offline eval shares: the twin database the fixture writes to. */
export interface OfflineEvalContext {
  db: TwinDb
  closeDb: () => Promise<void>
  stopStubs: () => Promise<void>
}

/** Deterministic assertions only; stubs live for the whole run, before the target boots. */
export default defineEvalConfig<OfflineEvalContext>({
  maxConcurrency: 4,
  timeoutMs: 60_000,
  async setup() {
    const url = process.env.TWIN_DATABASE_URL
    if (!url) throw new Error('TWIN_DATABASE_URL is not set; copy .env.example to .env')
    const stopStubs = await startStubs()
    const { db, close } = createTwinDb(url)
    return { db, closeDb: close, stopStubs }
  },
  async teardown(context) {
    await Promise.all([context?.closeDb(), context?.stopStubs()])
  },
})
