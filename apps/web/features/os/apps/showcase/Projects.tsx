import type { Entry } from '@/lib/cms/types'
import { Icon } from '../../icons'

/** The reference's ProjectBox: a raised row with an icon and a big title; ours links out to the thing itself. */
function ProjectBox({ row }: { row: Entry }) {
  const body = (
    <div className="projectLinkLeft">
      <Icon name="document" size={48} />
      <div className="projectText">
        <h1>{row.label}</h1>
        <h3>{row.meta}</h3>
      </div>
    </div>
  )
  return row.href ? (
    <a className="bigButton projectLink" href={row.href} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <div className="bigButton projectLink">{body}</div>
  )
}

interface Props {
  title: string
  subtitle: string
  projects: Entry[]
  content: Entry[]
}

/** The reference's "Projects & Hobbies": our projects, then content & community, as one list of boxes. */
export function Projects({ title, subtitle, projects, content }: Props) {
  return (
    <>
      <h1>{title}</h1>
      <h3>& {subtitle}</h3>
      <br />
      <p>Click on one of the entries below to open it. Each one links out to the real thing.</p>
      <br />
      <div className="projectLinks">
        {/* two collections: their ids may collide, so the key carries the list */}
        {projects.map((row) => (
          <ProjectBox key={`project-${row.id}`} row={row} />
        ))}
        {content.map((row) => (
          <ProjectBox key={`content-${row.id}`} row={row} />
        ))}
      </div>
    </>
  )
}
