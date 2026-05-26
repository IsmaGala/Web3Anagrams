// ─────────────────────────────────────────────────────────────────────────────
// SFX engine: ZzFX synth + sample player. Game-agnostic.
// Each game registers its own voice map via registerVoices().
//
// ZzFX ("Zuper Zmall Zound Zynth") by Frank Force, MIT licensed.
// https://github.com/KilledByAPixel/ZzFX
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100
const MASTER_VOL  = 0.35

let ctx: AudioContext | null = null
let muted = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    try { ctx = new AC() } catch { return null }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function zzfxBuild(
  volume = 1, randomness = .05, frequency = 220,
  attack = 0, sustain = 0, release = .1,
  shape = 0, shapeCurve = 1,
  slide = 0, deltaSlide = 0,
  pitchJump = 0, pitchJumpTime = 0,
  repeatTime = 0, noise = 0, modulation = 0,
  bitCrush = 0, delay = 0, sustainVolume = 1,
  decay = 0, tremolo = 0,
): Float32Array {
  const PI2 = Math.PI * 2
  const sign = (v: number) => v > 0 ? 1 : -1
  let startSlide = slide *= 500 * PI2 / SAMPLE_RATE / SAMPLE_RATE
  let startFrequency = frequency *= (1 + randomness * 2 * Math.random() - randomness) * PI2 / SAMPLE_RATE
  let t = 0, tm = 0, i = 0, j = 1, r = 0, c = 0, s = 0, f = 0
  attack *= SAMPLE_RATE + 9; decay *= SAMPLE_RATE; sustain *= SAMPLE_RATE
  release *= SAMPLE_RATE; delay *= SAMPLE_RATE
  deltaSlide *= 500 * PI2 / SAMPLE_RATE ** 3; modulation *= PI2 / SAMPLE_RATE
  pitchJump *= PI2 / SAMPLE_RATE; pitchJumpTime *= SAMPLE_RATE
  repeatTime = repeatTime * SAMPLE_RATE | 0
  const length = (attack + decay + sustain + release + delay) | 0
  const b = new Float32Array(length)
  for (; i < length; i++) {
    if (!bitCrush || !(++c % ((bitCrush * 100) | 0))) {
      s = shape ? shape > 1 ? shape > 2 ? shape > 3
        ? Math.sin((t % PI2) ** 3)
        : Math.max(Math.min(Math.tan(t), 1), -1)
        : 1 - (2 * t / PI2 % 2 + 2) % 2
        : 1 - 4 * Math.abs(Math.round(t / PI2) - t / PI2)
        : Math.sin(t)
      const env = i < attack ? i / attack
        : i < attack + decay ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
        : i < attack + decay + sustain ? sustainVolume
        : i < length - delay ? ((length - i - delay) / release) * sustainVolume : 0
      s = (repeatTime ? 1 - tremolo + tremolo * Math.sin(PI2 * i / repeatTime) : 1)
        * sign(s) * Math.abs(s) ** shapeCurve * env
      if (delay) s = s / 2 + (delay > i ? 0
        : ((i < length - delay ? 1 : (length - i) / delay) * b[(i - delay) | 0]) / 2)
    }
    f = (frequency += slide += deltaSlide) * Math.cos(modulation * tm++)
    t += f - f * noise * (1 - (Math.sin(i) * 1e9) % 2)
    if (j && ++j > pitchJumpTime) { frequency += pitchJump; startFrequency += pitchJump; j = 0 }
    if (repeatTime && !(++r % repeatTime)) { frequency = startFrequency; slide = startSlide; j = j || 1 }
    b[i] = s * volume
  }
  return b
}

export function zzfxPlay(params: number[]): void {
  const c = getCtx()
  if (!c) return
  const samples = zzfxBuild(...(params as Parameters<typeof zzfxBuild>))
  const buffer  = c.createBuffer(1, samples.length, SAMPLE_RATE)
  buffer.getChannelData(0).set(samples)
  const src  = c.createBufferSource()
  const gain = c.createGain()
  gain.gain.value = MASTER_VOL
  src.buffer = buffer
  src.connect(gain).connect(c.destination)
  src.start()
}

// ── Sample player ─────────────────────────────────────────────────────────────

interface SampleSpec { file: string; vol?: number }
const bufferCache = new Map<string, AudioBuffer | Promise<AudioBuffer>>()

function loadSample(file: string): Promise<AudioBuffer> | null {
  const c = getCtx()
  if (!c) return null
  const cached = bufferCache.get(file)
  if (cached) return cached instanceof AudioBuffer ? Promise.resolve(cached) : cached
  const p = fetch(file)
    .then(r => { if (!r.ok) throw new Error('sfx fetch ' + r.status); return r.arrayBuffer() })
    .then(ab => c.decodeAudioData(ab))
    .then(buf => { bufferCache.set(file, buf); return buf })
    .catch(err => { bufferCache.delete(file); throw err })
  bufferCache.set(file, p)
  return p
}

function playBuffer(c: AudioContext, buf: AudioBuffer, vol: number): void {
  const src  = c.createBufferSource()
  const gain = c.createGain()
  gain.gain.value = MASTER_VOL * vol
  src.buffer = buf
  src.connect(gain).connect(c.destination)
  src.start()
}

export function playSample(spec: SampleSpec): void {
  const c = getCtx()
  if (!c) return
  const cached = bufferCache.get(spec.file)
  if (cached instanceof AudioBuffer) { playBuffer(c, cached, spec.vol ?? 1); return }
  const p = loadSample(spec.file)
  if (!p) return
  p.then(buf => playBuffer(c, buf, spec.vol ?? 1)).catch(() => {})
}

// ── Voice registry ────────────────────────────────────────────────────────────

type VoiceDef =
  | { type: 'zzfx'; params: number[] }
  | { type: 'sample'; file: string; vol?: number }
  | { type: 'sequence'; notes: Array<{ freq: number; vol: number; delayMs: number }> }

const voiceRegistry = new Map<string, VoiceDef>()

/** Register one or more named voices. Called once at app startup.
 *  Subsequent registrations for the same key overwrite the previous one. */
export function registerVoices(voices: Record<string, VoiceDef>): void {
  for (const [key, def] of Object.entries(voices)) {
    voiceRegistry.set(key, def)
  }
}

export function playSfx(voice: string): void {
  if (muted) return
  const def = voiceRegistry.get(voice)
  if (!def) return
  try {
    if (def.type === 'zzfx') {
      zzfxPlay(def.params)
    } else if (def.type === 'sample') {
      playSample({ file: def.file, vol: def.vol })
    } else if (def.type === 'sequence') {
      for (const n of def.notes) {
        const fire = () => zzfxPlay([n.vol, 0.01, n.freq, 0.003, 0.015, 0.05, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0.02, 0])
        if (n.delayMs === 0) fire()
        else setTimeout(fire, n.delayMs)
      }
    }
  } catch (e) {
    console.warn('sfx failed:', voice, e)
  }
}

// ── Mute control ──────────────────────────────────────────────────────────────

const MUTE_KEY = 'gala_sfx_muted'

try {
  if (typeof localStorage !== 'undefined') {
    muted = localStorage.getItem(MUTE_KEY) === '1'
  }
} catch { /* private mode / SSR */ }

export function isSfxMuted(): boolean { return muted }

export function setSfxMuted(next: boolean): void {
  muted = next
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0')
    }
  } catch {}
}

export function unlockSfx(): void { getCtx() }
