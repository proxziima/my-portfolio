'use client'
import { useRef, useState } from 'react'
import { RoleDrum } from './RoleDrum'
import { RolePicker } from './RolePicker'
import { useRole } from './RoleProvider'

/** The headline's client island: the drum and the picker it opens. */
export function RoleControl({ hint }: { hint: string }) {
  const drumRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <RolePicker drumRef={drumRef} open={open} onOpenChange={setOpen} hint={hint}>
      <RoleDrum ref={drumRef} expanded={open} />
    </RolePicker>
  )
}

/**
 * The live status line for the role. A named export, not `RoleControl.Status`: a client reference
 * cannot carry statics across the server boundary.
 */
export function RoleStatus() {
  const { current } = useRole()
  return (
    <p className="sr-only" role="status">
      {current.title} selected
    </p>
  )
}
