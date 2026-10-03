import { Icon } from '../../icons'

interface Props {
  title?: string
  link?: { label: string; href: string }
}

/**
 * The reference's ResumeDownload strip, pointing at the letter instead of a PDF; the document icon
 * stands in for its printer gif. A relative href leaves the iframe through the layout's <base>.
 */
export function Strip({ title = 'Looking for the full letter?', link = { label: 'Open the site', href: '/' } }: Props) {
  return (
    <div className="strip">
      <Icon name="document" size={48} />
      <div className="stripText">
        <h3>{title}</h3>
        <a href={link.href}>
          <p>{link.label}</p>
        </a>
      </div>
    </div>
  )
}
