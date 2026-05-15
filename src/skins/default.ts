import type { WheelSkin } from './types'

// The original look — purple/violet tiles, soft lavender connector lines.
// Values here are the literal strings that used to be hardcoded inside
// Wheel.tsx; extracting them keeps the default visually identical to what
// players see today while letting other skins plug in via the same shape.
export const defaultSkin: WheelSkin = {
  id: 'default',
  label: 'Classic',
  description: 'The original violet wheel. Soft glow, friendly read.',
  ring: {
    border: 'rgba(124,58,237,0.2)',
    glow:   'rgba(124,58,237,0.1)',
  },
  connector: {
    gradientStart: 'rgba(196,181,253,0.9)',
    gradientEnd:   'rgba(124,58,237,0.9)',
    shadow:        'rgba(167,139,250,0.6)',
  },
  daily: {
    ring: {
      border: 'rgba(245,158,11,0.2)',
      glow:   'rgba(245,158,11,0.1)',
    },
    connector: {
      gradientStart: 'rgba(251,191,36,0.9)',
      gradientEnd:   'rgba(249,115,22,0.9)',
      shadow:        'rgba(251,191,36,0.6)',
    },
  },
}
