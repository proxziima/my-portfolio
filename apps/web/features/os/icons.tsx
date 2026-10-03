import type { SVGProps } from 'react'

export type IconName = 'computer' | 'folder' | 'document' | 'flag' | 'minimize' | 'maximize' | 'close'

/** 16×16 pixel-art paths; `shapeRendering="crispEdges"` keeps them sharp when scaled by integers. */
const PATHS: Record<IconName, { fill: string; d: string }[]> = {
  computer: [
    { fill: '#c0c0c0', d: 'M2 2h12v9H2z' },
    { fill: '#008080', d: 'M3 3h10v7H3z' },
    { fill: '#808080', d: 'M5 11h6v2H5zM3 13h10v1H3z' },
  ],
  folder: [
    { fill: '#808000', d: 'M1 3h6l1 1h7v9H1z' },
    { fill: '#ffff00', d: 'M1 6h14v7H1z' },
  ],
  document: [
    { fill: '#ffffff', d: 'M3 1h7l3 3v11H3z' },
    { fill: '#808080', d: 'M10 1v3h3zM5 6h6v1H5zM5 8h6v1H5zM5 10h6v1H5z' },
  ],
  flag: [
    { fill: '#ff0000', d: 'M2 2h6v6H2z' },
    { fill: '#00a000', d: 'M8 2h6v6H8z' },
    { fill: '#0000ff', d: 'M2 8h6v6H2z' },
    { fill: '#ffff00', d: 'M8 8h6v6H8z' },
  ],
  minimize: [{ fill: '#000000', d: 'M4 11h8v2H4z' }],
  maximize: [{ fill: '#000000', d: 'M3 3h10v10H3zM4 5v7h8V5z' }],
  close: [{ fill: '#000000', d: 'M4 3h2l2 2 2-2h2v2l-2 2 2 2v2h-2l-2-2-2 2H4v-2l2-2-2-2z' }],
}

export function Icon({ name, size = 32, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} shapeRendering="crispEdges" aria-hidden="true" focusable="false" {...rest}>
      {PATHS[name].map((p, i) => (
        <path key={i} fill={p.fill} d={p.d} />
      ))}
    </svg>
  )
}
