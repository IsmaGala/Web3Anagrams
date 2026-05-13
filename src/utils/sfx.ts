// ─────────────────────────────────────────────────────────────────────────────
// SFX engine — tech-aligned digital bleeps & blips via ZzFX.
//
// ZzFX ("Zuper Zmall Zound Zynth") by Frank Force — MIT licensed.
// https://github.com/KilledByAPixel/ZzFX
//
// We vendor the synth function inline (≈1KB) so this stays a zero-dependency
// addition, and expose a small named-voice API that the rest of the game
// can call without thinking about parameter arrays.
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100
const MASTER_VOL  = 0.35       // global ceiling on top of per-voice volume

let ctx: AudioContext | null = null
let muted = false

// ── AudioContext lifecycle ──────────────────────────────────────────────────
// Browsers require a user gesture before AudioContext can produce sound. We
// lazy-init on the first playSfx() call and resume() every time we're asked
// to play — cheap if already running.
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    try { ctx = new AC() } catch { return null }
  }
  if (ctx && ctx.state === 'suspended') {
    // .resume() returns a promise but we don't need to await it for fire-and-forget play
    ctx.resume().catch(() => {})
  }
  return ctx
}

// ── ZzFX core (vendored, MIT) ───────────────────────────────────────────────
// Returns a mono PCM buffer of float samples for the given parameter set.
// Parameter order matches the upstream ZzFX 1.x signature exactly.
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

// ── Named voices ────────────────────────────────────────────────────────────
// ZzFX parameter order, abbreviated for the most-used knobs:
//   [volume, randomness, frequency, attack, sustain, release,
//    shape (0 sine, 1 tri, 2 saw, 3 tan, 4 noise), shapeCurve,
//    slide, deltaSlide, pitchJump, pitchJumpTime,
//    repeatTime, noise, modulation, bitCrush, delay, sustainVolume,
//    decay, tremolo]
//
// All voices below are hand-tuned for a digital/crypto/chain aesthetic:
// short attack, bright triangle / square / saw shapes, clean envelopes.
type Voice =
  | 'letterTick' | 'wordValid' | 'wordBonus' | 'wordInvalid' | 'wordRepeat'
  | 'hint' | 'levelComplete' | 'dailyWin' | 'dailyLose'
  | 'purchase' | 'uiTap' | 'timerWarn'

const VOICES: Record<Voice, number[]> = {
  // Selecting a letter on the wheel — soft, fast, high
  letterTick:    [0.25, 0, 1200, 0.001, 0.01, 0.03, 1, 0.5, 0, 0,   0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
  // Word minted: rising triangle blip
  wordValid:     [0.55, 0.05, 520, 0.005, 0.04, 0.10, 1, 1.3,  6, 0,  0, 0, 0, 0, 0, 0, 0, 1, 0.05, 0],
  // Bonus token: pitch-jumped arpeggio sparkle
  wordBonus:     [0.65, 0.05, 660, 0.005, 0.05, 0.18, 1, 1,    0, 0, 660, 0.04, 0, 0, 0, 0, 0, 1, 0.08, 0],
  // Not in chain: soft sine "boop" with a gentle downward slide. Was a
  // sawtooth buzz before — too harsh on repeat hits, so dropped to sine,
  // ~half volume, and a shallow -1.5 slide instead of the steep -4.
  wordInvalid:   [0.22, 0.02, 280, 0.002, 0.02, 0.07, 0, 1,   -1.5, 0,  0, 0, 0, 0, 0, 0, 0, 1, 0.03, 0],
  // Already found: softer, mid-low triangle
  wordRepeat:    [0.35, 0.05, 300, 0.002, 0.02, 0.06, 1, 1,    0, 0,  0, 0, 0, 0, 0, 0, 0, 1, 0.04, 0],
  // Hint deployed: bright chime with subtle modulation
  hint:          [0.50, 0.02, 880, 0.005, 0.06, 0.15, 1, 1.2,  0, 0, 220, 0.06, 0, 0, 2, 0, 0, 1, 0.06, 0],
  // Single-player level done: ascending fanfare via pitch jumps
  levelComplete: [0.6, 0.05, 523, 0.005, 0.08, 0.20, 1, 1,    0, 0, 196, 0.08, 0, 0, 0, 0, 0, 1, 0.10, 0],
  // Daily challenge cleared: bigger, longer, with delay
  dailyWin:      [0.7, 0.05, 440, 0.01, 0.12, 0.30, 1, 1.1,   0, 0, 220, 0.10, 0, 0, 0, 0, 0.15, 1, 0.15, 0],
  // Daily failed: descending dark tone
  dailyLose:     [0.55, 0.05, 280, 0.01, 0.10, 0.30, 2, 1.4, -8, 0,  0, 0, 0, 0, 0, 0, 0, 1, 0.12, 0],
  // Shop purchase: softer "ka-ching" — warmer freq, less bitcrush, lower
  // volume. Was sharp/loud before; now feels rewarding without being shrill.
  purchase:      [0.32, 0.04, 1100, 0.008, 0.03, 0.14, 1, 1.6, 0, 0,    0, 0, 0, 0, 0, 0.15, 0, 1, 0.04, 0],
  // Menu confirm tap — warm triangle blip with a small upward pitch jump
  // (+200 Hz at 25 ms) so it feels like a "click → confirmed" gesture
  // rather than just a click. Soft enough to play on every menu press.
  uiTap:         [0.26, 0, 660, 0.001, 0.02, 0.06, 1, 1,    0, 0,  200, 0.025, 0, 0, 0, 0, 0, 1, 0.02, 0],
  // Optional: short warning beep when daily timer hits critical
  timerWarn:     [0.4, 0, 660, 0.001, 0.02, 0.08, 1, 1,      0, 0,    0, 0, 0, 0, 0, 0, 0, 1, 0.02, 0],
}

// ── Public API ──────────────────────────────────────────────────────────────

const MUTE_KEY = 'wc_sfx_muted'

// Hydrate mute pref from localStorage on first import
try {
  if (typeof localStorage !== 'undefined') {
    muted = localStorage.getItem(MUTE_KEY) === '1'
  }
} catch { /* private mode / SSR — ignore */ }

export function playSfx(voice: Voice): void {
  if (muted) return
  try {
    zzfxPlay(VOICES[voice])
  } catch (e) {
    // Audio failures are non-fatal; never let SFX crash gameplay.
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
