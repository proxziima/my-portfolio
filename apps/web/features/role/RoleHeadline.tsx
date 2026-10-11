import { RoleControl, RoleStatus } from './RoleControl'

interface Props {
  name: string
  tail: string
  hint: string
}

/** Name over "<drum> tail"; only the drum, its picker and the live status line are client code. */
export function RoleHeadline({ name, tail, hint }: Props) {
  return (
    <>
      <h1>
        <span className="who" data-anchor="name">{name}</span>
        <span className="what">
          <RoleControl hint={hint} />
          <span className="tail">{tail}</span>
        </span>
      </h1>
      <RoleStatus />
    </>
  )
}
