import { useCosmeticsStore } from '../store/cosmeticsStore'

// Helper for full-viewport screen wrappers (GameBoard, LevelSelect, etc.)
// that historically painted their own violet/teal vertical gradient on a
// `<div className="min-h-screen ...">`. Those gradients cover the body
// element, which is where the per-skin theming lives now (see global.css
// body[data-app-skin="..."] rules), so they hid the new themed backdrops.
//
// Strategy:
//   • Default skin → return the screen's bespoke gradient verbatim, so
//     the original look is pixel-identical for the majority of players.
//   • Any non-default skin → return 'transparent' so the body's themed
//     backdrop shows through. The body rules already produce a richer
//     full-page treatment per skin, so the screen wrapper has nothing
//     left to contribute.
//
// We don't try to centralize the per-screen default gradient here — each
// screen still owns its own default-skin palette (PremiumWorlds and
// WeeklyEvents have unique teal gradients, GameBoard has a daily/campaign
// switch, etc.). The caller passes whatever gradient they used to inline.
export function useScreenBackdrop(defaultBackground: string): string {
  const skin = useCosmeticsStore(s => s.wheelSkin)
  return skin === 'default' ? defaultBackground : 'transparent'
}
