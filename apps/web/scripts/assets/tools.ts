import { spawnSync } from 'node:child_process'

const REQUIRED_ENCODERS = ['libsvtav1', 'libvpx-vp9', 'libx264'] as const

/** The system ffmpeg, verified; only video recipes need it. Fails with install hints rather than producing worse files. */
export function ffmpeg(): { bin: string; version: string } {
  const v = spawnSync('ffmpeg', ['-hide_banner', '-version'], { encoding: 'utf8' })
  if (v.status !== 0) throw new Error('ffmpeg not found. Install it once: winget install Gyan.FFmpeg | brew install ffmpeg | apt install ffmpeg')
  const version = /ffmpeg version (\S+)/.exec(v.stdout)?.[1] ?? 'unknown'
  if (Number.parseInt(version, 10) < 7) throw new Error(`ffmpeg ${version} is too old: need ≥ 7`)
  const enc = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout
  const missing = REQUIRED_ENCODERS.filter((e) => !enc.includes(` ${e} `))
  if (missing.length) throw new Error(`ffmpeg lacks ${missing.join(', ')}: install a full build (gyan.dev "full", or distro ffmpeg with libsvtav1)`)
  const filters = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' }).stdout
  if (!filters.includes(' libvmaf ')) throw new Error('ffmpeg lacks the libvmaf filter, needed by the video parity gate')
  return { bin: 'ffmpeg', version }
}
