import type { WheelSkin } from './types'

// Blood skin — visceral, gothic, vampiric. Tiles read as coagulated dark
// blood at rest, then flare to bright arterial red the moment a letter is
// locked in. The connector line runs fresh-bright at the start of a word
// and darkens toward the tail, like a trail of fresh blood drying.
//
// Why the colors land here:
//   • Backgrounds stay deep crimson rather than pure black so the skin
//     reads as "blood" specifically, not just "dark." Pure black would
//     compete with the cybernetic skin's idle tile.
//   • Selected tiles intensify within the same red family instead of
//     pulling in a contrasting accent — keeps the visceral mood intact.
//   • Daily-mode shifts toward an alarm/klaxon scarlet (brighter, pinker)
//     so the daily affordance survives without breaking theme. Other
//     skins lean on gold/amber for daily; blood owns the loud-red lane
//     instead, which feels right for a "danger" palette.
//
// Letter glyphs use pale bone/pink (`#fecaca`, `#fff5f5`) — keeps the
// default clarity guarantee the rest of the family honors.
export const bloodSkin: WheelSkin = {
  id: 'blood',
  label: 'Blood',
  description: 'Coagulated crimson tiles, arterial lock-on.',
  price: 3000,
  ring: {
    // Fresh-blood red trace with a darker venous halo.
    border: 'rgba(220,38,38,0.35)',
    glow:   'rgba(127,29,29,0.25)',
  },
  connector: {
    // Bright arterial at the start, deep venous at the end — directional
    // "the blood is moving this way" feel as the word builds.
    gradientStart: 'rgba(252,165,165,0.95)',
    gradientEnd:   'rgba(185,28,28,0.95)',
    shadow:        'rgba(220,38,38,0.75)',
  },
  daily: {
    ring: {
      // Klaxon pink-red — louder than the campaign blood, screams "today".
      border: 'rgba(251,113,133,0.40)',
      glow:   'rgba(244,63,94,0.25)',
    },
    connector: {
      gradientStart: 'rgba(254,202,202,0.95)',
      gradientEnd:   'rgba(225,29,72,0.95)',
      shadow:        'rgba(244,63,94,0.75)',
    },
  },
}
