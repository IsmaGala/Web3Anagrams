// -----------------------------------------------------------------------------
// SFX engine: tech-aligned digital bleeps via ZzFX, plus a sample player for
// the Kenney UI Audio pack in public/audio/.
//
// ZzFX ("Zuper Zmall Zound Zynth") by Frank Force, MIT licensed.
// https://github.com/KilledByAPixel/ZzFX
//
// We vendor the synth function inline (~1KB) so this stays zero-dependency,
// and expose a small named-voice API that the rest of the game can call
// without thinking about parameter arrays. A subset of voices opt into real
// audio samples; the rest stay procedural.
// -----------------------------------------------------------------------------

const SAMPLE_RATE = 44100
const MASTER_VOL  = 0.35       // global ceiling on top of per-voice volume

let ctx: AudioContext | null = null
let muted = false

// AudioContext lifecycle: browsers require a user gesture before AudioContext
// can produce sound. We lazy-init on the first playSfx() call and resume()
// every time we play (cheap if already running).
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    try { ctx = new AC() } catch { return null }
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
  return ctx
}

// ZzFX core (vendored, MIT). Returns a mono PCM buffer of float samples for
// the given parameter set. Parameter order matches upstream ZzFX 1.x exactly.
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

  attack       = attack * SAMPLE_RATE + 9
  decay       *= SAMPLE_RATE
  sustain     *= SAMPLE_RATE
  release     *= SAMPLE_RATE
  delay       *= SAMPLE_RATE
  deltaSlide  *= 500 * PI2 / SAMPLE_RATE ** 3
  modulation  *= PI2 / SAMPLE_RATE
  pitchJump   *= PI2 / SAMPLE_RATE
  pitchJumpTime *= SAMPLE_RATE
  repeatTime   = repeatTime * SAMPLE_RATE | 0

  const length = (attack + decay + sustain + release + delay) | 0
  const b = new Float32Array(length)

  for (; i < length; i++) {
    if (!bitCrush || !(++c % ((bitCrush * 100) | 0))) {
      s = shape
        ? shape > 1
          ? shape > 2
            ? shape > 3
              ? Math.sin((t % PI2) ** 3)
              : Math.max(Math.min(Math.tan(t), 1), -1)
            : 1 - (2 * t / PI2 % 2 + 2) % 2
          : 1 - 4 * Math.abs(Math.round(t / PI2) - t / PI2)
        : Math.sin(t)

      const env = i < attack
        ? i / attack
        : i < attack + decay
          ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
          : i < attack + decay + sustain
            ? sustainVolume
            : i < length - delay
              ? ((length - i - delay) / release) * sustainVolume
              : 0

      s = (repeatTime ? 1 - tremolo + tremolo * Math.sin(PI2 * i / repeatTime) : 1)
        * sign(s) * Math.abs(s) ** shapeCurve * env

      if (delay) {
        s = s / 2 + (delay > i ? 0 : ((i < length - delay ? 1 : (length - i) / delay) * b[(i - delay) | 0]) / 2)
      }
    }
    f = (frequency += slide += deltaSlide) * Math.cos(modulation * tm++)
    t += f - f * noise * (1 - (Math.sin(i) * 1e9) % 2)
    if (j && ++j > pitchJumpTime) {
      frequency += pitchJump
      startFrequency += pitchJump
      j = 0
    }
    if (repeatTime && !(++r % repeatTime)) {
      frequency = startFrequency
      slide = startSlide
      j = j || 1
    }
    b[i] = s * volume
  }
  return b
}

function zzfxPlay(params: number[]) {
  const c = getCtx()
  if (!c) return
  const samples = zzfxBuild(...(params as Parameters<typeof zzfxBuild>))
  const buffer  = c.createBuffer(1, samples.length, SAMPLE_RATE)
  buffer.getChannelData(0).set(samples)
  const src     = c.createBufferSource()
  const gain    = c.createGain()
  gain.gain.value = MASTER_VOL
  src.buffer = buffer
  src.connect(gain).connect(c.destination)
  src.start()
}

// Named voices. ZzFX parameter order, abbreviated for the most-used knobs:
//   [volume, randomness, frequency, attack, sustain, release,
//    shape (0 sine, 1 tri, 2 saw, 3 tan, 4 noise), shapeCurve,
//    slide, deltaSlide, pitchJump, pitchJumpTime,
//    repeatTime, noise, modulation, bitCrush, delay, sustainVolume,
//    decay, tremolo]
// All voices are hand-tuned for a digital/crypto/chain aesthetic.
type Voice =
  | 'letterTick' | 'wordValid' | 'wordBonus' | 'wordInvalid' | 'wordRepeat'
  | 'hint' | 'levelComplete' | 'dailyWin' | 'dailyLose'
  | 'purchase' | 'uiTap' | 'timerWarn'

const VOICES: Record<Voice, number[]> = {
  letterTick:    [0.25, 0, 1200, 0.001, 0.01, 0.03, 1, 0.5, 0, 0,   0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
  // Soft sine blip with a gentle upward slide (3 vs the old steep 6) so the
  // "correct" cue still rises but doesn't sweep into a chirp. Volume dropped
  // 0.55 -> 0.30 and shape switched from triangle to sine to lose the buzz.
  wordValid:     [0.30, 0.03, 520, 0.005, 0.03, 0.08, 0, 1,    3, 0,  0, 0, 0, 0, 0, 0, 0, 1, 0.04, 0],
  wordBonus:     [0.65, 0.05, 660, 0.005, 0.05, 0.18, 1, 1,    0, 0, 660, 0.04, 0, 0, 0, 0, 0, 1, 0.08, 0],
  // Gentler "boop": volume 0.22 -> 0.14, slide softened -1.5 -> -1.0, slightly
  // lower base freq for a warmer no-feedback feel. Still clearly a descending
  // negative cue without nagging on repeat hits.
  wordInvalid:   [0.14, 0.02, 260, 0.003, 0.02, 0.06, 0, 1,   -1.0, 0,  0, 0, 0, 0, 0, 0, 0, 1, 0.03, 0],
  wordRepeat:    [0.35, 0.05, 300, 0.002, 0.02, 0.06, 1, 1,    0, 0,  0, 0, 0, 0, 0, 0, 0, 1, 0.04, 0],
  hint:          [0.50, 0.02, 880, 0.005, 0.06, 0.15, 1, 1.2,  0, 0, 220, 0.06, 0, 0, 2, 0, 0, 1, 0.06, 0],
  levelComplete: [0.6, 0.05, 523, 0.005, 0.08, 0.20, 1, 1,    0, 0, 196, 0.08, 0, 0, 0, 0, 0, 1, 0.10, 0],
  dailyWin:      [0.7, 0.05, 440, 0.01, 0.12, 0.30, 1, 1.1,   0, 0, 220, 0.10, 0, 0, 0, 0, 0.15, 1, 0.15, 0],
  dailyLose:     [0.55, 0.05, 280, 0.01, 0.10, 0.30, 2, 1.4, -8, 0,  0, 0, 0, 0, 0, 0, 0, 1, 0.12, 0],
  purchase:      [0.32, 0.04, 1100, 0.008, 0.03, 0.14, 1, 1.6, 0, 0,    0, 0, 0, 0, 0, 0.15, 0, 1, 0.04, 0],
  uiTap:         [0.26, 0, 660, 0.001, 0.02, 0.06, 1, 1,    0, 0,  200, 0.025, 0, 0, 0, 0, 0, 1, 0.02, 0],
  timerWarn:     [0.4, 0, 660, 0.001, 0.02, 0.08, 1, 1,      0, 0,    0, 0, 0, 0, 0, 0, 0, 1, 0.02, 0],
}

// Sample player (Kenney UI Audio pack). A handful of UI-flavored voices route
// to real samples from public/audio/ (Kenney "UI Audio" pack, CC0). Everything
// else stays procedural ZzFX.
//
// Loading is lazy: the first playSfx() for a sampled voice kicks off a fetch
// + decodeAudioData, and the resulting AudioBuffer is cached for instant
// replays. The very first tap of a brand-new voice may be silent for a
// fraction of a second while the decode runs.

const SAMPLE_BASE = '/audio'

interface SampleSpec {
  file: string
  // Per-voice gain multiplier. Samples land hotter than ZzFX output, so
  // values here are usually well below 1.0 to match the synth voices.
  vol?: number
}

// Voice -> sample file. Only voices listed here use samples; the rest fall
// through to ZzFX. Tweak files/vol to taste; the Kenney pack ships dozens of
// click/rollover/switch variants in public/audio/.
const SAMPLES: Partial<Record<Voice, SampleSpec>> = {
  uiTap:      { file: 'click4.ogg',    vol: 0.7 },
  letterTick: { file: 'rollover6.ogg', vol: 0.55 },
  purchase:   { file: 'switch33.ogg',   vol: 0.7 },
}

// Cache stores either the decoded AudioBuffer or an in-flight Promise so
// concurrent plays during the first fetch don't trigger duplicate requests.
const bufferCache = new Map<string, AudioBuffer | Promise<AudioBuffer>>()

function loadSample(file: string): Promise<AudioBuffer> | null {
  const c = getCtx()
  if (!c) return null
  const cached = bufferCache.get(file)
  if (cached) return cached instanceof AudioBuffer ? Promise.resolve(cached) : cached
  const p = fetch(SAMPLE_BASE + '/' + file)
    .then(r => {
      if (!r.ok) throw new Error('sfx fetch ' + r.status + ' for ' + file)
      return r.arrayBuffer()
    })
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

function playSampleVoice(spec: SampleSpec): void {
  const c = getCtx()
  if (!c) return
  const cached = bufferCache.get(spec.file)
  if (cached instanceof AudioBuffer) {
    playBuffer(c, cached, spec.vol ?? 1)
    return
  }
  const p = loadSample(spec.file)
  if (!p) return
  p.then(buf => playBuffer(c, buf, spec.vol ?? 1)).catch(() => { /* swallow */ })
}

// Hint sequence: three short ascending sine blips. The previous single-shot
// hint voice was bright but felt loud and a little aggressive on repeat hits.
// This sparkle pattern stays recognizable as the hint cue (no other voice
// does a 3-note rise) while sitting much softer in the mix.
//
// Each blip is a near-pure sine (shape 0) at low volume, ~60ms apart, with
// a tiny pitch climb (660 -> 880 -> 1100 Hz, roughly E5 / A5 / C#6) so the
// listener perceives a quick rising chime rather than three repeats.
const HINT_NOTES: Array<{ freq: number; vol: number; delayMs: number }> = [
  { freq: 660,  vol: 0.18, delayMs: 0   },
  { freq: 880,  vol: 0.16, delayMs: 60  },
  { freq: 1100, vol: 0.14, delayMs: 120 },
]

function playHintSequence(): void {
  for (const n of HINT_NOTES) {
    const fire = () => zzfxPlay([
      n.vol, 0.01, n.freq,
      0.003, 0.015, 0.05,
      0, 1,
      0, 0,
      0, 0,
      0, 0, 0,
      0, 0, 1,
      0.02, 0,
    ])
    if (n.delayMs === 0) fire()
    else setTimeout(fire, n.delayMs)
  }
}

// Public API

const MUTE_KEY = 'wc_sfx_muted'

// Hydrate mute pref from localStorage on first import
try {
  if (typeof localStorage !== 'undefined') {
    muted = localStorage.getItem(MUTE_KEY) === '1'
  }
} catch { /* private mode / SSR */ }

export function playSfx(voice: Voice): void {
  if (muted) return
  try {
    if (voice === 'hint') {
      playHintSequence()
      return
    }
    const sample = SAMPLES[voice]
    if (sample) {
      playSampleVoice(sample)
    } else {
      zzfxPlay(VOICES[voice])
    }
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('sfx failed:', voice, e)
  }
}

export function isSfxMuted(): boolean {
  return muted
}

export function setSfxMuted(next: boolean): void {
  muted = next
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0')
    }
  } catch { /* ignore */ }
}

/** Called once on first real user gesture (button click) to unlock audio on
 *  browsers that suspend new AudioContexts. Safe to call repeatedly. */
export function unlockSfx(): void {
  getCtx()
}
