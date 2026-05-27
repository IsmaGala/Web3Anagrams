// bgm.ts — Background music player with lightwave rotation pattern.
//
// Two Prism tracks rotate in a naturally-varying pattern so the music never
// feels mechanical. The "lightwave" algorithm: after each track finishes,
// the probability of switching to the other track grows with the consecutive-
// play streak. Short runs of 1-2 plays are most common; tracks can repeat up
// to 4 times before a mandatory switch.
//
// Module-level state persists across React renders — only one playback instance
// exists at any time. Call startBgm() on the first user gesture to satisfy the
// browser autoplay policy; subsequent calls are no-ops.

const TRACKS = [
  '/audio/bgm_prism_01.mp3',
  '/audio/bgm_prism_02.mp3',
] as const

const BGM_MUTE_KEY = 'wc_bgm_muted'
const BGM_VOL      = 0.35   // sits comfortably below the SFX layer

let audio:      HTMLAudioElement | null = null
let muted:      boolean = false
let currentIdx: number  = 0
let streak:     number  = 1   // consecutive full plays of currentIdx
let running:    boolean = false

// Hydrate mute pref from localStorage on first import
try {
  if (typeof localStorage !== 'undefined') {
    muted = localStorage.getItem(BGM_MUTE_KEY) === '1'
  }
} catch { /* private mode / SSR */ }

// ── Lightwave rotation ──────────────────────────────────────────────────────
// Switch probability after n consecutive plays of the same track:
//   1 play  → 20%  (usually repeats)
//   2 plays → 45%
//   3 plays → 75%
//   4+ plays→ 100% (always switches)
// Expected run length ≈ 2.3 plays per session — feels natural and wave-like.
function shouldSwitch(s: number): boolean {
  if (s >= 4) return true
  const prob = ([0.20, 0.45, 0.75] as const)[s - 1] ?? 0
  return Math.random() < prob
}

function startTrack(idx: number) {
  if (audio) { audio.onended = null; audio.pause() }
  audio = new Audio(TRACKS[idx])
  audio.volume = muted ? 0 : BGM_VOL
  audio.onended = onTrackEnd
  audio.play().catch(() => {
    // Autoplay blocked — the next user gesture will resume via setBgmMuted
    // or the mute toggle (which calls startBgm again if needed).
  })
}

function onTrackEnd() {
  if (shouldSwitch(streak)) {
    currentIdx = 1 - currentIdx
    streak = 1
  } else {
    streak++
  }
  startTrack(currentIdx)
}

// Pause when the tab is hidden, resume when it comes back — avoids the music
// continuing to play inaudibly and avoids a jarring re-sync on return.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!audio) return
    if (document.hidden) {
      audio.pause()
    } else if (running && !muted) {
      audio.play().catch(() => {})
    }
  })
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Start BGM — idempotent. Must be called inside (or after) a user gesture
 *  so the browser's autoplay policy is satisfied. Safe to call on every tap;
 *  subsequent calls are no-ops once music is running. */
export function startBgm(): void {
  if (running) return
  running = true
  currentIdx = Math.random() < 0.5 ? 0 : 1
  streak = 1
  startTrack(currentIdx)
}

export function isBgmMuted(): boolean {
  return muted
}

export function setBgmMuted(next: boolean): void {
  muted = next
  if (audio) audio.volume = next ? 0 : BGM_VOL
  // If BGM was started but autoplay was blocked, unmuting is the user's
  // next gesture — use it to kick off playback.
  if (!next && running && audio && audio.paused && !document.hidden) {
    audio.play().catch(() => {})
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BGM_MUTE_KEY, next ? '1' : '0')
    }
  } catch { /* ignore */ }
}
