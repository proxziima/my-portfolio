import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf8')
const isClient = (path: string) => /^\s*['"]use client['"]/.test(source(path))

// the letter hydrates only where state lives: a 'use client' creeping back into a server piece puts
// its whole subtree back into the hydration work (spec §6.1)
describe('the letter’s server/client boundary', () => {
  it.each([
    'features/portfolio/Portfolio.tsx',
    'features/role/RoleHeadline.tsx',
    'features/sections/ContactLinks.tsx',
    'features/sections/FooterNav.tsx',
    'shared/ui/Section.tsx',
    'shared/ui/ChipLink.tsx',
  ])('%s renders on the server', (path) => {
    expect(isClient(path)).toBe(false)
  })

  it.each([
    'features/theme/LightSwitch.tsx',
    'features/role/RoleControl.tsx',
    'features/role/RoleProvider.tsx',
    'features/curious/CuriousProvider.tsx',
    'features/curious/CuriousOverlay.tsx',
    'features/bio/Bio.tsx',
    'features/figure/Figure.tsx',
    'features/sections/EntryList.tsx',
  ])('%s is a client island', (path) => {
    expect(isClient(path)).toBe(true)
  })

  it('passes the headline’s client island no functions, only text', () => {
    expect(source('features/role/RoleHeadline.tsx')).toMatch(/<RoleControl hint=\{hint\} \/>/)
  })
})
