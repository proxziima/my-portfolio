/**
 * The slice of js-dos v7's browser globals (`public/js-dos/js-dos.js`) the Doom app touches, from the
 * reference's bundled types (`player.d.ts`, emulators-ui's `DosInstance`). Optional on `window`: they
 * exist only once `loadJsDos()` has run the script.
 */

interface JsDosOptions {
  /** js-dos's own chrome; 'none' drops it. */
  style?: 'default' | 'none'
  noSideBar?: boolean
  noFullscreen?: boolean
  noSocialLinks?: boolean
  clickToStart?: boolean
  onExit?: () => void
}

interface JsDosPlayer {
  run(bundleUrl: string, optionalChangesUrl?: string, optionalPersistKey?: string): Promise<unknown>
  stop(): Promise<void>
  /** On: a click on the screen captures the pointer (Esc releases it) and the emulator gets relative motion. */
  setAutolock(autolock: boolean): Promise<void>
}

interface Window {
  Dos?: (root: HTMLDivElement, options?: JsDosOptions) => JsDosPlayer
  /** Where the emulator fetches `wdosbox.js`/`.wasm`; '' (the default) means relative to the page. */
  emulators?: { pathPrefix: string }
}
