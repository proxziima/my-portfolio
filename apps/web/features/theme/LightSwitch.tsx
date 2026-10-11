'use client'
import { useRef } from 'react'
import { useBlowout } from '@/features/blowout/use-blowout'
import '@/features/blowout/blowout.css'
import { useReducedMotion } from '@/lib/dom/use-reduced-motion'
import { WallSwitch } from './WallSwitch'

/** The wall switch and its blowout (flick it too fast and the bulb goes): the only users of the switch's ref. */
export function LightSwitch() {
  const reduce = useReducedMotion()
  const switchRef = useRef<HTMLDivElement>(null)
  const blowout = useBlowout(switchRef, reduce)
  return <WallSwitch ref={switchRef} disabled={blowout.isActive} onToggled={blowout.register} />
}
