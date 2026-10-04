'use client'
import { Icon, type IconName } from './icons'
import { openGestures } from './open-gestures'
import styles from './Shortcut.module.css'

/** A desktop icon: a click selects (focus); a double click, Enter, Space or a screen reader's click opens. */
export function Shortcut({ icon, label, onOpen }: { icon: IconName; label: string; onOpen: () => void }) {
  return (
    <button type="button" className={styles.shortcut} {...openGestures(onOpen)}>
      <Icon name={icon} size={32} />
      <span className={styles.label}>{label}</span>
    </button>
  )
}
