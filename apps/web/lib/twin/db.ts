import 'server-only'
import { createTwinDb, type TwinDb } from '@repo/twin/db'
import { twinEnv } from './env'

let handle: TwinDb | null = null

/** The process-wide twin database handle for the BFF. */
export function twinDb(): TwinDb {
  handle ??= createTwinDb(twinEnv().TWIN_DATABASE_URL).db
  return handle
}
