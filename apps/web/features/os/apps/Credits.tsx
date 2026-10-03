import type { OsAppProps } from '../apps'

/** What this desktop is and where it comes from. */
export function Credits({ data }: OsAppProps) {
  return (
    <div style={{ padding: 16, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 16, margin: '0 0 8px' }}>About this desktop</h1>
      <p>
        This is a web page shown on the monitor of a three.js scene on {data.profile.name}&rsquo;s site. The scene draws
        baked models with WebGL; the screen is a CSS3D iframe of this very page, so what you are using is real.
      </p>
      <p>
        The idea and the desk model follow{' '}
        <a href="https://henryheffernan.com/" target="_blank" rel="noopener noreferrer">Henry Heffernan&rsquo;s portfolio</a>{' '}
        (MIT licensed). Built with Next, React and three.js; content from a Payload CMS.
      </p>
      <p>Tip: hover the monitor to zoom in, move away to zoom out.</p>
    </div>
  )
}
