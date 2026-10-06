import { defineConfig } from 'drizzle-kit'

// Generation is offline (schema → SQL); only `db:migrate` touches a database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './migrations',
  schemaFilter: ['twin'],
})
