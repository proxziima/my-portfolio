'use client'
import { useState } from 'react'
import type { Entry, Portfolio } from '@/lib/cms/types'
import { filterByDiscipline } from '@/lib/cms/filter'
import type { OsAppProps } from '../apps'
import styles from './Showcase.module.css'

type Page = 'home' | 'about' | 'work' | 'projects' | 'content' | 'contact'

/** Rows for a list page, keyed by the default discipline like the letter's first view. */
function EntryRows({ entries, slug }: { entries: Entry[]; slug: string }) {
  const rows = filterByDiscipline(entries, slug)
  if (rows.length === 0) return <p>Nothing here yet.</p>
  return (
    <ul className={styles.rows}>
      {rows.map((row) => (
        <li key={row.id}>
          <span className={styles.rowMain}>
            {row.href ? <a href={row.href} target="_blank" rel="noopener noreferrer">{row.label}</a> : row.label}
            <span className={styles.meta}>{row.meta}</span>
          </span>
          {row.aside && <span className={styles.aside}>{row.aside}</span>}
        </li>
      ))}
    </ul>
  )
}

const pages = (data: Portfolio): { id: Page; label: string }[] => [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'work', label: data.settings.sectionLabels.work },
  { id: 'projects', label: data.settings.sectionLabels.projects },
  { id: 'content', label: data.settings.sectionLabels.content },
  { id: 'contact', label: 'Contact' },
]

/** The explorer window: the letter's content as an old-web site, with a side nav off the home page. */
export function Showcase({ data }: OsAppProps) {
  const [page, setPage] = useState<Page>('home')
  const discipline = data.disciplines.find((d) => d.slug === data.defaultSlug) ?? data.disciplines[0]
  const slug = discipline?.slug ?? ''
  const nav = pages(data)
  // the bio paragraphs are the CMS's own HTML dialect (lib/cms/bio-html.ts): already escaped there
  const bioHtml = (discipline?.bio ?? []).map((p) => `<p>${p}</p>`).join('')

  return (
    <div className={styles.explorer} data-page={page}>
      {page !== 'home' && (
        <nav className={styles.sidebar} aria-label="Showcase">
          <b className={styles.brand}>{data.profile.name}</b>
          {nav.map((p) => (
            <button key={p.id} type="button" className={styles.navLink} aria-current={p.id === page ? 'page' : undefined} onClick={() => setPage(p.id)}>
              {p.label}
            </button>
          ))}
        </nav>
      )}
      <div className={styles.page}>
        {page === 'home' && (
          <div className={styles.home}>
            <h1>{data.profile.name}</h1>
            <h2>{discipline?.title ?? data.profile.headlineTail}</h2>
            <div className={styles.homeLinks}>
              {nav.filter((p) => p.id !== 'home').map((p) => (
                <button key={p.id} type="button" className={styles.navLink} onClick={() => setPage(p.id)}>{p.label}</button>
              ))}
            </div>
          </div>
        )}
        {page === 'about' && (
          <>
            <h1>About</h1>
            <div className={styles.prose} dangerouslySetInnerHTML={{ __html: bioHtml }} />
          </>
        )}
        {page === 'work' && (<><h1>{data.settings.sectionLabels.work}</h1><EntryRows entries={data.work} slug={slug} /></>)}
        {page === 'projects' && (<><h1>{data.settings.sectionLabels.projects}</h1><EntryRows entries={data.projects} slug={slug} /></>)}
        {page === 'content' && (<><h1>{data.settings.sectionLabels.content}</h1><EntryRows entries={data.content} slug={slug} /></>)}
        {page === 'contact' && (
          <>
            <h1>Contact</h1>
            <ul className={styles.rows}>
              <li><a href={`mailto:${data.profile.email}`}>{data.profile.email}</a></li>
              {data.contactLinks.map((l) => (
                <li key={`${l.href}|${l.label}`}><a href={l.href} target="_blank" rel="noopener noreferrer">{l.label}</a></li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
