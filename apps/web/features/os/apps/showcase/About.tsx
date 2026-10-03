import { osBioHtml } from '../../bio-markup'
import { Strip } from './Strip'

interface Props {
  name: string
  bio: readonly string[]
}

/**
 * The reference's About: "Welcome" pulled 16px into the gutter, the greeting, the bio, the strip.
 * Its paragraphs are split by <br /> as the reference's are, so the gaps between them match.
 */
export function About({ name, bio }: Props) {
  // the bio is the CMS's own HTML dialect (lib/cms/bio-html.ts), escaped there
  const html = bio.map((paragraph) => osBioHtml([paragraph])).join('<br />')
  return (
    <>
      <h1 style={{ marginLeft: -16 }}>Welcome</h1>
      <h3>I&apos;m {name}</h3>
      <br />
      <div className="text-block" dangerouslySetInnerHTML={{ __html: html }} />
      <Strip />
    </>
  )
}
