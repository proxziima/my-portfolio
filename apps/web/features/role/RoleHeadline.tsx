'use client'
import { useRef, useState } from 'react'
import { RoleDrum } from './RoleDrum'
import { RolePicker } from './RolePicker'
import { useRole } from './RoleProvider'

interface Props {
  name: string
  tail: string
  hint: string
}

/** Name over "<drum> tail", with a live status line for the role. */
export function RoleHeadline({ name, tail, hint }: Props) {
  const { current } = useRole()
  const drumRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <h1 data-anchor="headline">
        <span className="who">{name}</span>
        <span className="what">
          <RolePicker drumRef={drumRef} open={open} onOpenChange={setOpen} hint={hint}>
            <RoleDrum ref={drumRef} expanded={open} />
          </RolePicker>
          <span className="tail">{tail}</span>
        </span>
      </h1>
      <p className="sr-only" role="status">
        {current.title} selected
      </p>
    </>
  )
}
