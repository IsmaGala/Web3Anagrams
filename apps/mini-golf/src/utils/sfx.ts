// Golf SFX voice definitions. Registered at app startup in main.tsx.
// Uses the shared ZzFX engine from @gala-games/metagame.

import { registerVoices } from '@gala-games/metagame'

export type GolfVoice =
  | 'shot'          // ball struck
  | 'wallHit'       // ball bounces off wall
  | 'holeIn'        // ball drops in hole
  | 'sandHit'       // ball enters sand
  | 'waterSplash'   // ball drops in water
  | 'penaltyStroke' // water penalty
  | 'uiTap'
  | 'purchase'
  | 'dailyWin'
  | 'dailyLose'

export function registerGolfVoices(): void {
  registerVoices({
    shot:         { type: 'zzfx', params: [0.35, 0.03, 180, 0.001, 0.02, 0.08, 0, 1.2, -2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0.03, 0] },
    wallHit:      { type: 'zzfx', params: [0.20, 0.02, 320, 0.001, 0.01, 0.05, 1, 1,    0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0.02, 0] },
    holeIn:       { type: 'sequence', notes: [
      { freq: 523, vol: 0.30, delayMs: 0   },
      { freq: 659, vol: 0.28, delayMs: 80  },
      { freq: 784, vol: 0.25, delayMs: 160 },
    ]},
    sandHit:      { type: 'zzfx', params: [0.12, 0.15, 80,  0.001, 0.05, 0.10, 4, 1,   0, 0, 0, 0, 0, 0.8, 0, 0, 0, 1, 0.04, 0] },
    waterSplash:  { type: 'zzfx', params: [0.28, 0.10, 140, 0.001, 0.04, 0.15, 4, 0.8, -1, 0, 0, 0, 0, 0.5, 0, 0, 0, 1, 0.05, 0] },
    penaltyStroke:{ type: 'zzfx', params: [0.22, 0.02, 260, 0.003, 0.02, 0.06, 0, 1,  -1,  0, 0, 0, 0, 0, 0, 0, 0, 1, 0.03, 0] },
    uiTap:        { type: 'zzfx', params: [0.26, 0,    660, 0.001, 0.02, 0.06, 1, 1,   0,  0, 200, 0.025, 0, 0, 0, 0, 0, 1, 0.02, 0] },
    purchase:     { type: 'zzfx', params: [0.32, 0.04, 1100, 0.008, 0.03, 0.14, 1, 1.6, 0, 0, 0, 0, 0, 0, 0, 0.15, 0, 1, 0.04, 0] },
    dailyWin:     { type: 'sequence', notes: [
      { freq: 440,  vol: 0.28, delayMs: 0   },
      { freq: 550,  vol: 0.26, delayMs: 100 },
      { freq: 660,  vol: 0.24, delayMs: 200 },
    ]},
    dailyLose:    { type: 'zzfx', params: [0.55, 0.05, 280, 0.01, 0.10, 0.30, 2, 1.4, -8, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0.12, 0] },
  })
}
