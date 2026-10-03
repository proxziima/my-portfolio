import type { LinkItem } from '@/lib/cms/types'
import { isExternal } from '@/shared/ui/chip-markup'
import { Strip } from './Strip'

interface Props {
  email: string
  links: LinkItem[]
}

/**
 * The reference's Contact: the heading with a row of raised social squares, the note and the email.
 * Its form is left out (there is no backend to post to); the squares show each link's chip, not a logo.
 */
export function Contact({ email, links }: Props) {
  return (
    <>
      <div className="contactHeader">
        <h1>Contact</h1>
        <div className="socials">
          {links.map((link) => (
            <a
              key={`${link.href}|${link.label}`}
              className="bigButton social"
              href={link.href}
              aria-label={link.label}
              title={link.label}
              {...(isExternal(link.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {link.chip}
            </a>
          ))}
        </div>
      </div>
      <div className="text-block">
        <p>I&apos;d love to hear from you. The quickest way is email, or any of the links above.</p>
        <br />
        <p>
          <b>Email: </b>
          <a href={`mailto:${email}`}>{email}</a>
        </p>
      </div>
      <Strip title="Need the letter instead?" />
    </>
  )
}
