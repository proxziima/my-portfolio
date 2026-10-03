'use client'
import { useRef } from 'react'
import type { Portfolio as PortfolioData } from '@/lib/cms/types'
import { useReducedMotion } from '@/lib/dom/use-reduced-motion'
import { Bio } from '@/features/bio/Bio'
import { useBlowout } from '@/features/blowout/use-blowout'
import '@/features/blowout/blowout.css'
import { CuriousOverlay } from '@/features/curious/CuriousOverlay'
import { CuriousProvider } from '@/features/curious/CuriousProvider'
import { Figure } from '@/features/figure/Figure'
import { RoleHeadline } from '@/features/role/RoleHeadline'
import { RoleProvider } from '@/features/role/RoleProvider'
import { ContactLinks } from '@/features/sections/ContactLinks'
import { EntryList } from '@/features/sections/EntryList'
import { FooterNav } from '@/features/sections/FooterNav'
import { WallSwitch } from '@/features/theme/WallSwitch'

/** The client composition root: one letter, every feature reading the shared role and curious state. */
export function Portfolio({ data }: { data: PortfolioData }) {
  const reduce = useReducedMotion()
  const switchRef = useRef<HTMLDivElement>(null)
  const blowout = useBlowout(switchRef, reduce)
  const { settings } = data
  // the role reducer sizes itself from the discipline count once: a different set needs a fresh provider
  const roleKey = data.disciplines.map((d) => d.slug).join('|')
  return (
    <RoleProvider key={roleKey} disciplines={data.disciplines} defaultSlug={data.defaultSlug}>
      <CuriousProvider>
        <main>
          <WallSwitch ref={switchRef} disabled={blowout.isActive} onToggled={blowout.register} />
          <RoleHeadline name={data.profile.name} tail={data.profile.headlineTail} hint={settings.pickerHint} />
          <Bio />
          <Figure />
          <ContactLinks links={data.contactLinks} />
          <EntryList id="work" title={settings.sectionLabels.work} entries={data.work} />
          <EntryList id="projects" title={settings.sectionLabels.projects} entries={data.projects} />
          <EntryList id="content" title={settings.sectionLabels.content} entries={data.content} />
          <FooterNav items={data.nav} name={data.profile.name} />
        </main>
        <CuriousOverlay pageNotes={settings.pageNotes} />
      </CuriousProvider>
    </RoleProvider>
  )
}
