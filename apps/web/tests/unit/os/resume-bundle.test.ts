import { strFromU8, unzipSync } from 'fflate'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const bundle = unzipSync(readFileSync(fileURLToPath(new URL('../../../public/resume.jsdos', import.meta.url))))
const conf = bundle['.jsdos/dosbox.conf']
if (!conf) throw new Error('resume.jsdos has no .jsdos/dosbox.conf')
const autoexec = (strFromU8(conf).split('[autoexec]')[1] ?? '').split(/\r?\n/).map((line) => line.trim())

describe('the My Resume bundle', () => {
  it('opens the résumé in Acrobat Reader for DOS', () => {
    expect(bundle['ACRODOS/RESUME.PDF']).toBeDefined()
    expect(autoexec).toContain('ACROBAT RESUME.PDF')
  })

  // the Reader tracks its hand from the running mickey totals of a spec-compliant driver,
  // which js-dos's built-in INT 33h driver does not report (see the design spec, 3.14c)
  it('loads CuteMouse on the PS/2 port before the Reader', () => {
    expect(bundle['CTMOUSE.EXE']).toBeDefined()
    const mouse = autoexec.indexOf('CTMOUSE /P')
    expect(mouse).toBeGreaterThan(autoexec.indexOf('c:'))
    expect(mouse).toBeLessThan(autoexec.indexOf('ACROBAT RESUME.PDF'))
  })
})
