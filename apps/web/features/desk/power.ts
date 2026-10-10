/** The monitor's power: dark until the visitor approaches, booting while the OS loads, then on for good. */
export type Power = 'off' | 'booting' | 'on'
/** What told the monitor to boot (see `watchApproach`, and full screen). */
export type IntentSource = 'pointer' | 'focus' | 'visible' | 'fullscreen'
export type PowerEvent = { type: 'intent'; source: IntentSource } | { type: 'loaded' }

/** Pure. There is no way back to `off`: once powered, the OS stays, as it always has. */
export function reducePower(state: Power, event: PowerEvent): Power {
  switch (event.type) {
    case 'intent':
      return state === 'off' ? 'booting' : state
    case 'loaded':
      return state === 'booting' ? 'on' : state
  }
}
