import { useEffect, useRef, useState } from 'react'
import { useGameStore } from './store/gameStore'
import { useProgressStore } from './store/progressStore'
import { useWalletStore } from './store/walletStore'
import { useCosmeticsStore } from './store/cosmeticsStore'
import { WORLDS } from './data/worldData'
import Splash from './components/Splash'
import WorldSelect from './components/WorldSelect'
import LevelSelect from './components/LevelSelect'
import GameBoard from './components/GameBoard'
import PremiumWorlds from './components/PremiumWorlds'
import WeeklyEvents from './components/WeeklyEvents'
import GemStore from './components/GemStore'
import Wardrobe from './components/Wardrobe'
import DebugMenu from './components/DebugMenu'
import OnboardingOverlay, { hasSeenOnboarding, markOnboardingSeen } from './components/OnboardingOverlay'
import WorldRewardOverlay from './components/WorldRewardOverlay'
import { pullAndApply, schedulePush, flushPush } from './utils/profileSync'
import './styles/global.css'

export default function App() {
  const screen     = useGameStore(s => s.screen)
  const loadLevels = useGameStore(s => s.loadLevels)
  const markLevelComplete = useProgressStore(s => s.markLevelComplete)
  const jwt = useWalletStore(s => s.jwt)
  const didPullForJwt = useRef<string | null>(null)
  // First-run onboarding. We snapshot the localStorage flag once on mount so
  // the overlay opens at most once per session; dismissal both flips the
  // flag and removes the overlay.
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding())

  useEffect(() => {
    const allLevels = WORLDS.flatMap(w => w.levels)
    loadLevels(allLevels)
    useGameStore.setState({
      _onLevelComplete: (worldId: string, levelIndex: number, score: number) => {
        markLevelComplete(worldId as any, levelIndex, score)
      }
    } as any)
    // Surface any pre-existing world-completion bounties for returning
    // players. A player who cleared Town Star before this feature shipped
    // will see the WorldRewardOverlay on the next app load.
    useGameStore.getState().scanForUnclaimedWorldRewards()
  }, [loadLevels, markLevelComplete])

  // Cross-device sync — when the JWT becomes available, pull-and-merge.
  // Each unique JWT triggers exactly one pull (the ref tracks which JWT we
  // already pulled for) so renders don't cause repeated network round-trips.
  // After the merge lands, re-scan for unclaimed world-completion bounties
  // so a fresh device sees the same retroactive rewards the player would
  // see on their original device.
  useEffect(() => {
    if (!jwt) {
      didPullForJwt.current = null
      return
    }
    if (didPullForJwt.current === jwt) return
    didPullForJwt.current = jwt
    Promise.resolve(pullAndApply()).finally(() => {
      useGameStore.getState().scanForUnclaimedWorldRewards()
      // First-wallet welcome bonus is now SERVER-issued as of milestone 2.
      // It fires inside the first GET /api/profile call for a given wallet
      // (see api/profile.ts), gated by a balance_transactions audit row so
      // it can fire exactly once per address regardless of how many devices
      // the player connects from.
      //
      // `pullAndApply()` reads the response's `balances` and updates the
      // local gemsBalance/hints; if a bonus was granted, those balances
      // already include it. The toast UX moved into pullAndApply so the
      // notification fires in the place that actually applies the balance.
      // No client-side grant happens here anymore — removing this block
      // closes the cheat where flipping `firstWalletBonusClaimed` in
      // localStorage and refreshing re-minted +15 gems / +5 hints.
    })
  }, [jwt])

  // Mirror the active wheel skin onto <body data-app-skin="..."> so global
  // styling in global.css can theme the page background per-skin. We do
  // this here (rather than inside Wheel.tsx) because the background needs
  // to track the skin on every screen, not only when the wheel is mounted.
  //
  // Why an attribute instead of a className: the skin id is already a
  // kebab-case string ('deep-sea'), and selectors like `body[data-app-skin
  // ="deep-sea"]` compose cleanly with the existing `body.daily-mode` rules
  // without polluting the class list.
  const appSkin = useCosmeticsStore(s => s.wheelSkin)
  useEffect(() => {
    document.body.dataset.appSkin = appSkin
    // Don't clear on unmount — App is the single root and lives for the
    // entire session. Leaving the attribute in place avoids a one-frame
    // flicker back to the default backdrop if anything ever remounts.
  }, [appSkin])

  // Subscribe to every store whose state should round-trip through the
  // server. Any change after login schedules a debounced push to
  // /api/profile/sync. The debounce coalesces a flurry of changes
  // (level complete → gain score, hints, money, possibly grant skin)
  // into one round-trip.
  useEffect(() => {
    if (!jwt) return
    const unsub1 = useGameStore.subscribe(() => schedulePush())
    const unsub2 = useProgressStore.subscribe(() => schedulePush())
    // Cosmetics: when the player buys / wins / equips a skin, the
    // unlock should follow them across devices. Same debounce as the
    // other stores.
    const unsub3 = useCosmeticsStore.subscribe(() => schedulePush())
    // Best-effort flush on tab unload so a pending push doesn't get lost
    // when the player closes the browser mid-debounce.
    const onUnload = () => { flushPush() }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      unsub1(); unsub2(); unsub3()
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [jwt])

  return (
    <>
      {screen === 'splash'      && <Splash />}
      {screen === 'worldSelect' && <WorldSelect />}
      {screen === 'levelSelect' && <LevelSelect />}
      {screen === 'game'        && <GameBoard />}
      {screen === 'premium'     && <PremiumWorlds />}
      {screen === 'events'      && <WeeklyEvents />}
      {screen === 'store'       && <GemStore />}
      {screen === 'wardrobe'    && <Wardrobe />}
      <DebugMenu />
      {/* Globally mounted so a queued reward (live win or retroactive
          scan hit) surfaces on whatever screen the player happens to be on. */}
      <WorldRewardOverlay />
      {showOnboarding && (
        <OnboardingOverlay onDone={() => { markOnboardingSeen(); setShowOnboarding(false) }} />
      )}
    </>
  )
}
