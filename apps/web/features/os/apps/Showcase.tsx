'use client'
import { useState } from 'react'
import { filterByDiscipline } from '@/lib/cms/filter'
import type { OsAppProps } from '../apps'
import { About } from './showcase/About'
import { Contact } from './showcase/Contact'
import { Home } from './showcase/Home'
import { defaultDiscipline, navItems, type ShowcasePage } from './showcase/pages'
import { Projects } from './showcase/Projects'
import { Sidebar } from './showcase/Sidebar'
import { Work } from './showcase/Work'
import './showcase.css'

/**
 * The explorer window as the reference's Showcase site: a landing page, then a fixed sidebar beside
 * a scrolling page. Lists show the letter's default discipline, the view the page opens on.
 */
export function Showcase({ data }: OsAppProps) {
  const [page, setPage] = useState<ShowcasePage>('home')
  const discipline = defaultDiscipline(data)
  const slug = discipline?.slug ?? ''
  const items = navItems(data)
  const labels = data.settings.sectionLabels

  return (
    <div className="showcase" data-page={page}>
      {page === 'home' ? (
        <Home name={data.profile.name} title={discipline?.title ?? data.profile.headlineTail} items={items} onNavigate={setPage} />
      ) : (
        <>
          <Sidebar name={data.profile.name} items={items} page={page} onNavigate={setPage} />
          <div className="content">
            {page === 'about' && <About name={data.profile.name} bio={discipline?.bio ?? []} />}
            {page === 'work' && <Work rows={filterByDiscipline(data.work, slug)} />}
            {page === 'projects' && (
              <Projects
                title={labels.projects}
                subtitle={labels.content}
                projects={filterByDiscipline(data.projects, slug)}
                content={filterByDiscipline(data.content, slug)}
              />
            )}
            {page === 'contact' && <Contact email={data.profile.email} links={data.contactLinks} />}
          </div>
        </>
      )}
    </div>
  )
}
