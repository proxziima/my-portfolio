/**
 * content/resume.md → a PDF 1.0 inside public/resume.jsdos, the "My Resume" app's bundle
 * (`bun run resume:pdf`). The bundle is the Acrobat Reader for DOS install; only its
 * ACRODOS/RESUME.PDF entry is replaced, which the bundle's autoexec opens.
 */
import { unzipSync, zipSync } from 'fflate'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { layout } from './layout'
import { parseMarkdown } from './markdown'
import { writePdf10 } from './pdf10'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const SOURCE = here('../../content/resume.md')
const BUNDLE = here('../../public/resume.jsdos')
/** Where the bundle's autoexec (`ACROBAT RESUME.PDF` in C:\ACRODOS) expects it. */
const ENTRY = 'ACRODOS/RESUME.PDF'

const blocks = parseMarkdown(readFileSync(SOURCE, 'utf8'))
const title = blocks.find((b) => b.kind === 'title')
const pages = layout(blocks)
const pdf = writePdf10(pages, title?.kind === 'title' ? title.text : 'Resume')

const files = unzipSync(readFileSync(BUNDLE))
files[ENTRY] = pdf
writeFileSync(BUNDLE, zipSync(files, { level: 9 }))
console.log(`${BUNDLE}: ${ENTRY} updated, ${pages.length} page(s), ${pdf.length} bytes`)
