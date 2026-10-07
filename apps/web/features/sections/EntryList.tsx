'use client'
import type { Entry } from '@/lib/cms/types'
import { filterByDiscipline } from '@/lib/cms/filter'
import { useRole } from '@/features/role/RoleProvider'
import { ChipLink } from '@/shared/ui/ChipLink'
import { Section } from '@/shared/ui/Section'
import styles from './EntryList.module.css'

/** Work, Projects and Content: rows filtered by the current role. Keyed by role, so it re-enters on change. */
export function EntryList({ id, title, entries }: { id: string; title: string; entries: Entry[] }) {
  const { current } = useRole()
  const rows = filterByDiscipline(entries, current.slug)
  if (rows.length === 0) return null
  return (
    <Section id={id} title={title}>
      <ol key={current.slug} className={styles.list}>
        {rows.map((row) => (
          <li key={row.id} className={styles.row}>
            <span className={styles.main}>
              <ChipLink chip={row.chip} label={row.label} href={row.href} icon={row.icon} />
              <span className={styles.meta}>{row.meta}</span>
            </span>
            {row.aside && <span className={styles.aside}>{row.aside}</span>}
          </li>
        ))}
      </ol>
    </Section>
  )
}
