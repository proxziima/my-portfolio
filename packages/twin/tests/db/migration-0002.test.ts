import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(import.meta.dirname, '../../migrations')
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

async function apply(pg: PGlite, file: string) {
  for (const stmt of readFileSync(join(dir, file), 'utf8').split('--> statement-breakpoint')) {
    if (stmt.trim()) await pg.exec(stmt)
  }
}

describe('migration 0002', () => {
  it('backfills reply codes, and notified_at for settled approvals only, then drops telegram_message_id', async () => {
    const pg = new PGlite()
    await apply(pg, files[0]!)
    await apply(pg, files[1]!)
    await pg.exec(`
      INSERT INTO twin.visitors (id) VALUES ('00000000-0000-4000-8000-0000000000b1');
      INSERT INTO twin.conversations (session_id, visitor_id, state)
        VALUES ('sess-1', '00000000-0000-4000-8000-0000000000b1', '{}');
      INSERT INTO twin.approvals (id, session_id, source_id, topic, reason, status, telegram_message_id)
        VALUES ('00000000-0000-4000-8000-0000000000a1', 'sess-1', 'knowledge:1', 'T', 'r', 'approved', 5),
               ('00000000-0000-4000-8000-0000000000a2', 'sess-1', 'knowledge:2', 'T', 'r', 'denied', NULL),
               ('00000000-0000-4000-8000-0000000000a3', 'sess-1', 'knowledge:3', 'T', 'r', 'pending', 6);
    `)
    await apply(pg, files[2]!)
    const { rows } = await pg.query<{ reply_code: string; notified_at: Date | null }>(
      'SELECT reply_code, notified_at FROM twin.approvals ORDER BY id',
    )
    expect(rows[0]!.reply_code).toMatch(/^[0-9A-F]{4}$/)
    expect(rows[0]!.notified_at).not.toBeNull()
    expect(rows[1]!.reply_code).toMatch(/^[0-9A-F]{4}$/)
    expect(rows[1]!.notified_at).toBeNull()
    // A Telegram-era pending row was never texted its iMessage code, so it must not count as notified.
    expect(rows[2]!.reply_code).toMatch(/^[0-9A-F]{4}$/)
    expect(rows[2]!.notified_at).toBeNull()
    const cols = await pg.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'approvals' AND column_name = 'telegram_message_id'",
    )
    expect(cols.rows).toHaveLength(0)
    await pg.close()
  })
})
