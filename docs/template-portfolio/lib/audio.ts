/** One AudioContext for the whole page: the switch click, the bulb, the thuds.
 *  Created lazily on the first user gesture so autoplay policy is satisfied. */

let ctx: AudioContext | null = null;

export function audio(): AudioContext | null {
  const AC =
    typeof window === 'undefined'
      ? null
      : window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** The reference site's own switch click: 65ms of LCG noise (seed 42) with a
 *  two-spike envelope, through a bandpass that slides down a quarter. */
export function clickSound(theme: 'light' | 'dark') {
  try {
    const t = audio();
    if (!t) return;
    const n = t.currentTime;
    const r = 0.065;
    const buf = t.createBuffer(1, Math.ceil(t.sampleRate * r), t.sampleRate);
    const a = buf.getChannelData(0);
    let o = 42;
    for (let i = 0; i < a.length; i++) {
      o = (o * 16807) % 2147483647;
      const w = (o / 2147483647) * 2 - 1;
      const s = i / t.sampleRate;
      a[i] = w * (Math.exp(-s * 132) + (s > 0.016 ? Math.exp(-(s - 0.016) * 220) * 0.52 : 0));
    }
    const src = t.createBufferSource();
    const bp = t.createBiquadFilter();
    const g = t.createGain();
    src.buffer = buf;
    bp.type = 'bandpass';
    const u = theme === 'light' ? 1450 : 1050;
    bp.frequency.setValueAtTime(u, n);
    bp.frequency.exponentialRampToValueAtTime(u * 0.74, n + r);
    bp.Q.setValueAtTime(0.72, n);
    g.gain.setValueAtTime(1e-4, n);
    g.gain.exponentialRampToValueAtTime(theme === 'light' ? 0.115 : 0.105, n + 0.002);
    g.gain.exponentialRampToValueAtTime(1e-4, n + r);
    src.connect(bp).connect(g).connect(t.destination);
    src.start(n);
    src.stop(n + r);
  } catch {
    /* no audio, no problem */
  }
}

/** The bulb sample, decoded once and kept. Call warm() early (2nd fast click)
 *  so it is ready when the bulb actually goes. */
let bulb: AudioBuffer | null = null;
let loading: Promise<void> | null = null;

export function warmBulb(url = '/sound/bulb-explode.mp3') {
  const t = audio();
  if (!t || bulb || loading) return loading;
  loading = fetch(url)
    .then((r) => r.arrayBuffer())
    .then((ab) => t.decodeAudioData(ab))
    .then((b) => {
      bulb = b;
    })
    .catch(() => {
      loading = null;
    });
  return loading;
}

export function playBulb() {
  try {
    const t = audio();
    if (!t) return;
    const n = t.currentTime;
    if (bulb) {
      const s = t.createBufferSource();
      const g = t.createGain();
      s.buffer = bulb;
      g.gain.value = 0.9;
      s.connect(g).connect(t.destination);
      s.start(n);
    }
    const o = t.createOscillator();
    const og = t.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(100, n);
    o.frequency.exponentialRampToValueAtTime(36, n + 0.26);
    og.gain.setValueAtTime(0.32, n);
    og.gain.exponentialRampToValueAtTime(1e-4, n + 0.32);
    o.connect(og).connect(t.destination);
    o.start(n);
    o.stop(n + 0.34);
  } catch {}
}

/** Impact noise for the falling switch. v is 0…1 by impact speed. */
export function thud(v: number) {
  try {
    const t = audio();
    if (!t) return;
    const n = t.currentTime;
    const r = 0.09;
    const buf = t.createBuffer(1, Math.ceil(t.sampleRate * r), t.sampleRate);
    const a = buf.getChannelData(0);
    for (let i = 0; i < a.length; i++) {
      const s = i / t.sampleRate;
      a[i] = (Math.random() * 2 - 1) * Math.exp(-s * 60);
    }
    const src = t.createBufferSource();
    const lp = t.createBiquadFilter();
    const g = t.createGain();
    src.buffer = buf;
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    g.gain.setValueAtTime(0.18 * v, n);
    g.gain.exponentialRampToValueAtTime(1e-4, n + r);
    src.connect(lp).connect(g).connect(t.destination);
    src.start(n);
    src.stop(n + r);

    const o = t.createOscillator();
    const og = t.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(95, n);
    o.frequency.exponentialRampToValueAtTime(50, n + 0.08);
    og.gain.setValueAtTime(0.22 * v, n);
    og.gain.exponentialRampToValueAtTime(1e-4, n + 0.1);
    o.connect(og).connect(t.destination);
    o.start(n);
    o.stop(n + 0.11);
  } catch {}
}
