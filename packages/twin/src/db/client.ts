import { drizzle } from 'drizzle-orm/node-postgres'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'
import * as schema from './schema'

/** Driver-agnostic handle: production uses node-postgres, tests use pglite with the same schema. */
export type TwinDb = PgDatabase<PgQueryResultHKT, typeof schema>

/** Opens a pooled connection to the twin database. One per process. */
export function createTwinDb(url: string): { db: TwinDb; close: () => Promise<void> } {
  const pool = new Pool({ connectionString: url, max: 10 })
  return { db: drizzle(pool, { schema }), close: () => pool.end() }
}
