import { CHIP_CLASS, CHIP_IMG_CLASS, CHIP_LINK_CLASS, isExternal, safeIcon, type ChipLinkProps } from './chip-markup'

/** The React twin of `chipLinkHtml`: same classes and attributes, so there is one visual source. */
export function ChipLink({ chip, label, href, icon }: ChipLinkProps) {
  const link = href ?? undefined
  const external = link ? isExternal(link) : false
  const src = safeIcon(icon)
  return (
    <a className={CHIP_LINK_CLASS} href={link} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {src ? (
        <img className={`${CHIP_CLASS} ${CHIP_IMG_CLASS}`} src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" />
      ) : (
        <i className={CHIP_CLASS} aria-hidden="true">{chip}</i>
      )}
      <span>{label}</span>
    </a>
  )
}
