import type { Portfolio as PortfolioData } from '@/lib/cms/types'
import { Bio } from '@/features/bio/Bio'
import { CuriousOverlay } from '@/features/curious/CuriousOverlay'
import { CuriousProvider } from '@/features/curious/CuriousProvider'
import { Figure } from '@/features/figure/Figure'
import { RoleHeadline } from '@/features/role/RoleHeadline'
import { RoleProvider } from '@/features/role/RoleProvider'
import { ContactLinks } from '@/features/sections/ContactLinks'
import { EntryList } from '@/features/sections/EntryList'
import { FooterNav } from '@/features/sections/FooterNav'
import { LightSwitch } from '@/features/theme/LightSwitch'

/** The letter: static structure rendered on the server, client islands where role, curious, theme or the scene live. */
export function Portfolio({ data }: { data: PortfolioData }) {
  const { settings } = data
  // the role reducer sizes itself from the discipline count once: a different set needs a fresh provider
  const roleKey = data.disciplines.map((d) => d.slug).join('|')
  return (
    <RoleProvider key={roleKey} disciplines={data.disciplines} defaultSlug={data.defaultSlug}>
      <CuriousProvider>
        <main>
          <LightSwitch />
          <RoleHeadline name={data.profile.name} tail={data.profile.headlineTail} hint={settings.pickerHint} />
          <Bio />
          <Figure />
          <ContactLinks links={data.contactLinks} />
          <EntryList id="work" title={settings.sectionLabels.work} entries={data.work} />
          <EntryList id="projects" title={settings.sectionLabels.projects} entries={data.projects} />
          <EntryList id="content" title={settings.sectionLabels.content} entries={data.content} />
        </main>
        <FooterNav items={data.nav} name={data.profile.name} />
        <CuriousOverlay pageNotes={settings.pageNotes} />
      </CuriousProvider>
    </RoleProvider>
  )
}
