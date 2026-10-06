import { describe, expect, it } from 'vitest'
import { parseSkillFile } from '../scripts/bundle-skills'

describe('parseSkillFile', () => {
  it('reads eve SKILL.md frontmatter and body', () => {
    const f = parseSkillFile('x', '---\ndescription: Does X.\nmetadata:\n  version: "1.2.0"\n---\n# X\n\nBody.\n')
    expect(f).toEqual({ name: 'x', description: 'Does X.', version: '1.2.0', body: '# X\n\nBody.' })
  })

  it('normalises CRLF line endings (Windows checkouts)', () => {
    const f = parseSkillFile('x', '---\r\ndescription: Does X.\r\nmetadata:\r\n  version: "1.2.0"\r\n---\r\n# X\r\n\r\nBody.\r\n')
    expect(f).toEqual({ name: 'x', description: 'Does X.', version: '1.2.0', body: '# X\n\nBody.' })
  })

  it('rejects a skill without a semver version', () => {
    expect(() => parseSkillFile('x', '---\ndescription: d\n---\nbody')).toThrow(/version/)
  })
})
