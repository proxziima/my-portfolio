import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '../db/schema'
import type { TwinDb } from '../db/client'

/** An in-process Postgres for tests: zero network, same migrations as production. */
export interface TestDb {
  db: TwinDb
  close: () => Promise<void>
}

/** Creates a fresh, migrated in-memory database. */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../migrations', import.meta.url)),
    migrationsSchema: 'twin_migrations',
  })
  return { db: db as unknown as TwinDb, close: () => client.close() }
}
