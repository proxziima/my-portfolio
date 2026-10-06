import type { ResolvedApp } from '../../apps'
import { Icon } from '../../icons'
import styles from './messenger.module.css'

/** The service bar under What's new: in the original, Windows Live's sites; here, the desktop's other programs. */
export function Services({ apps, open }: { apps: readonly ResolvedApp[]; open: (appId: string) => void }) {
  return (
    <nav className={styles.services} aria-label="Programs">
      {apps.map((app) => (
        <button key={app.id} type="button" title={app.shortcut} aria-label={app.shortcut} onClick={() => open(app.id)}>
          <Icon name={app.icon} size={24} />
        </button>
      ))}
    </nav>
  )
}
