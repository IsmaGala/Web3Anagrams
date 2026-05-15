import type { WheelSkin } from './types'

// Deep Sea skin — abyssal navy tiles with a bioluminescent teal trace, like
// glow-creatures drifting at depth. Selected tiles flare to bright aqua,
// the way a hatchetfish or jellyfish lights up when disturbed. The
// connector line reads as a phosphorescent trail through dark water.
//
// Why the colors land here:
//   • Idle background sits deeper-blue than the default purple so it
//     doesn't compete with the campaign violet, and deeper-teal than the
//     cybernetic cyan so the two oceanic-looking palettes stay distinct.
//   • Selected pops to a bright aqua/cyan instead of magenta — keeps the
//     palette monochromatic within "the sea" rather than introducing a
//     contrasting accent color that would break the underwater mood.
//   • Daily mode shifts to an anglerfish-lure amber. Players already know
//     daily mode = warm, and "amber light in deep water" is a real visual
//     cue (anglerfish, lanternfish) that fits the theme.
export const deepSeaSkin: WheelSkin = {
  id: 'deep-sea',
  label: 'Deep Sea',
  description: 'Abyssal navy tiles, bioluminescent aqua lock-on.',
  ring: {
    // Soft kelp-green border with a cold cyan halo bleeding outward.
    border: 'rgba(94,234,212,0.30)',
    glow:   'rgba(34,211,238,0.18)',
  },
  connector: {
    // Teal at the start of the trace, brighter aqua at the end — reads as
    // a glowing trail picking up energy as the word builds.
    gradientStart: 'rgba(94,234,212,0.95)',
    gradientEnd:   'rgba(103,232,249,0.95)',
    shadow:        'rgba(34,211,238,0.7)',
  },
  daily: {
    ring: {
      // Anglerfish-lure amber peeking through the dark.
      border: 'rgba(251,191,36,0.32)',
      glow:   'rgba(217,119,6,0.22)',
    },
    connector: {
      // Warmer trail: gold filament fading into amber.
      gradientStart: 'rgba(253,224,71,0.95)',
      gradientEnd:   'rgba(251,146,60,0.95)',
      shadow:        'rgba(217,119,6,0.7)',
    },
  },
}
