const BASE = '/js-dos/'

let loading: Promise<void> | null = null

/**
 * Adds js-dos's stylesheet and script to the page once, as the reference's index.html did, but only when
 * a DOS window first opens: half a megabyte of runtime is not worth loading for visitors who never play.
 * A second window reuses the same promise; a failed load is forgotten so a later window can retry.
 */
export function loadJsDos(): Promise<void> {
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `${BASE}js-dos.css`
    const script = document.createElement('script')
    script.src = `${BASE}js-dos.js`
    script.async = true
    script.addEventListener('load', () => {
      // the emulator resolves wdosbox.js/.wasm against this prefix, not against the script's own URL
      if (window.emulators) window.emulators.pathPrefix = BASE
      resolve()
    })
    script.addEventListener('error', () => {
      link.remove()
      script.remove()
      loading = null
      reject(new Error('js-dos failed to load'))
    })
    document.head.append(link, script)
  })
  return loading
}
