import type { Entry } from '@/lib/cms/types'
import { Strip } from './Strip'

/** The reference prints a job's site as "www.hover.gg": the bare host of the link. */
const hostOf = (href: string): string | undefined => {
  try {
    return new URL(href).hostname
  } catch {
    return undefined
  }
}

/** One Experience header: company and site on the first row, role and period on the second. */
function Job({ row }: { row: Entry }) {
  const host = row.href ? hostOf(row.href) : undefined
  return (
    <div className="jobHeader">
      <div className="jobHeaderInner">
        <div className="jobHeaderRow">
          <h1>{row.label}</h1>
          {row.href && host && (
            <a href={row.href} target="_blank" rel="noopener noreferrer">
              <h4>{host}</h4>
            </a>
          )}
        </div>
        <div className="jobHeaderRow">
          <h3>{row.meta}</h3>
          {row.aside && (
            <b>
              <p>{row.aside}</p>
            </b>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The reference's Experience page: the strip first, then one header per job. Our rows have no
 * description or bullets, so the text block under each header is left out rather than invented.
 */
export function Work({ rows }: { rows: Entry[] }) {
  return (
    <>
      <Strip />
      {rows.map((row) => (
        <Job key={row.id} row={row} />
      ))}
    </>
  )
}
