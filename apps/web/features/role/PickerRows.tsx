'use client'
import type { CSSProperties } from 'react'
import type { Discipline } from '@/lib/cms/types'
import { mod, optionOffsets } from './role-cycle'
import styles from './RolePicker.module.css'

/** Rows rendered around the current position: 3 visible plus one masked on each side. */
const WINDOW = [-2, -1, 0, 1, 2]

interface Props {
  disciplines: Discipline[]
  position: number
  animate: boolean
  /** Offset of the clicked row from the current one (0 = the current row). */
  onPick: (offset: number) => void
}

/**
 * A virtual window keyed by unbounded position: React keeps each row across
 * steps, so its transform transitions and the list rolls with no renormalising.
 */
export function PickerRows({ disciplines, position, animate, onPick }: Props) {
  const options = optionOffsets(position, disciplines.length)
  return WINDOW.map((offset) => {
    const p = position + offset
    const d = disciplines[mod(p, disciplines.length)]!
    // masked rows and repeats of a visible role (fewer than 3 roles) are decoration
    const isOption = options.has(offset)
    return (
      <span
        key={p}
        role={isOption ? 'option' : undefined}
        aria-selected={isOption ? offset === 0 : undefined}
        aria-hidden={isOption ? undefined : true}
        className={styles.row}
        data-current={offset === 0}
        data-animate={animate}
        style={{ '--offset': offset } as CSSProperties}
        onClick={() => onPick(offset)}
      >
        <span className={styles.name}>{d.title}</span>
        <span className={styles.meta}>{d.level}</span>
      </span>
    )
  })
}
