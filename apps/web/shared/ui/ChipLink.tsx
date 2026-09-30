import { CHIP_CLASS, CHIP_LINK_CLASS, isExternal } from './chip-markup'

/** The React twin of `chipLinkHtml`: same classes and attributes, so there is one visual source. */
export function ChipLink({ chip, label, href }: { chip: string; label: string; href?: string }) {
  const external = href ? isExternal(href) : false
  return (
    <a className={CHIP_LINK_CLASS} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      <i className={CHIP_CLASS} aria-hidden="true">{chip}</i>
      <span>{label}</span>
    </a>
  )
}
