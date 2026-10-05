import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

/** Folder of committed SQL migrations, resolved from this file so it works from any cwd. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations', import.meta.url))

/** Applies pending migrations; run before the agents service starts (see its Dockerfile). */
async function main(): Promise<void> {
  const url = process.env.TWIN_DATABASE_URL
  if (!url) throw new Error('TWIN_DATABASE_URL is required to migrate')
  const pool = new Pool({ connectionString: url, max: 1 })
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER })
  } finally {
    await pool.end()
  }
}

if (import.meta.main) await main()
