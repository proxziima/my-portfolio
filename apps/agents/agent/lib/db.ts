import { createTwinDb, type TwinDb } from '@repo/twin/db'
import { getEnv } from './env'

let handle: TwinDb | null = null

/** The process-wide twin database handle, opened on first use. */
export function db(): TwinDb {
  handle ??= createTwinDb(getEnv().TWIN_DATABASE_URL).db
  return handle
}
