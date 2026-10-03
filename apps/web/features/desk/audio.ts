import { playChime } from '@/lib/audio/chime'
import { audioContext } from '@/lib/audio/context'
import { ambienceParams } from './ambience'

const DIR = '/desk/audio'
const SAMPLES = {
  mouseDown: `${DIR}/mouse-down.mp3`,
  mouseUp: `${DIR}/mouse-up.mp3`,
  keys: [1, 2, 3, 4, 5, 6].map((n) => `${DIR}/key-${n}.mp3`),
  office: `${DIR}/office.mp3`,
}
const LEVEL = { key: 0.8, mouse: 0.8 }
/** Stereo stand-in for the reference's positional audio: keyboard a little left, mouse to the right. */
const PAN = { key: -0.15, mouse: 0.4 }
/** The ambience follows the camera with a short ramp so a zoom never clicks. */
const RAMP = 0.15

export interface DeskAudio {
  /** From a user gesture: resume the context, decode the samples, play the chime, start the ambience. Idempotent. */
  unlock(): void
  /** A key pressed in the OS; held keys do not repeat. */
  key(code: string, repeat: boolean): void
  keyUp(): void
  mouse(kind: 'down' | 'up'): void
  /** The camera's distance to the desk origin, from the engine's frames. */
  setDistance(distance: number): void
  setMuted(on: boolean): void
  dispose(): void
}

interface Loop {
  source: AudioBufferSourceNode
  filter: BiquadFilterNode
  gain: GainNode
}

/**
 * The scene's sounds on the shared AudioContext. Nothing fetches or plays before `unlock()`, which
 * must come from a user gesture (autoplay policy). Decoding failures stay silent: audio is decoration.
 */
export function createDeskAudio(): DeskAudio {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let muted = false
  let disposed = false
  let lastKey: string | null = null
  let ambience: Loop | null = null
  let distance = 6000
  const buffers = new Map<string, Promise<AudioBuffer | null>>()

  const load = (url: string): Promise<AudioBuffer | null> => {
    let pending = buffers.get(url)
    if (!pending) {
      const c = ctx
      pending = c
        ? fetch(url).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b)).catch(() => null)
        : Promise.resolve(null)
      buffers.set(url, pending)
    }
    return pending
  }

  const play = async (url: string, volume: number, pan: number) => {
    if (!ctx || !master) return
    const buffer = await load(url)
    if (!buffer || disposed || !master) return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = volume
    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    source.connect(gain).connect(panner).connect(master)
    source.start()
  }

  const startAmbience = async () => {
    if (!ctx || !master || ambience) return
    const buffer = await load(SAMPLES.office)
    if (!buffer || disposed || ambience || !master) return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    const gain = ctx.createGain()
    const { frequency, volume } = ambienceParams(distance)
    filter.frequency.value = frequency
    gain.gain.value = volume
    source.connect(filter).connect(gain).connect(master)
    source.start()
    ambience = { source, filter, gain }
  }

  return {
    unlock() {
      if (ctx || disposed) return
      ctx = audioContext()
      if (!ctx) return
      master = ctx.createGain()
      master.gain.value = muted ? 0 : 1
      master.connect(ctx.destination)
      for (const url of [SAMPLES.mouseDown, SAMPLES.mouseUp, ...SAMPLES.keys]) void load(url)
      playChime(master)
      void startAmbience()
    },
    key(code, repeat) {
      if (repeat || code === lastKey) return
      lastKey = code
      const sample = SAMPLES.keys[Math.floor(Math.random() * SAMPLES.keys.length)]
      if (sample) void play(sample, LEVEL.key, PAN.key)
    },
    keyUp() {
      lastKey = null
    },
    mouse(kind) {
      void play(kind === 'down' ? SAMPLES.mouseDown : SAMPLES.mouseUp, LEVEL.mouse, PAN.mouse)
    },
    setDistance(d) {
      distance = d
      if (!ambience || !ctx) return
      const { frequency, volume } = ambienceParams(d)
      const t = ctx.currentTime
      ambience.filter.frequency.setTargetAtTime(frequency, t, RAMP)
      ambience.gain.gain.setTargetAtTime(volume, t, RAMP)
    },
    setMuted(on) {
      muted = on
      if (master && ctx) master.gain.setTargetAtTime(on ? 0 : 1, ctx.currentTime, 0.02)
    },
    dispose() {
      disposed = true
      try {
        ambience?.source.stop()
      } catch {
        /* already stopped */
      }
      ambience = null
      master?.disconnect()
      master = null
    },
  }
}
