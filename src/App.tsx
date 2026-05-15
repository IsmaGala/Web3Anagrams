import { useEffect, useRef, useState } from 'react'
import { useGameStore } from './store/gameStore'
import { useProgressStore } from './store/progressStore'
import { useWalletStore } from './store/walletStore'
import { WORLDS } from './data/worldData'
import Splash from './components/Splash'
import WorldSelect from './components/WorldSelect'
import LevelSelect from './components/LevelSelect'
import GameBoard from './components/GameBoard'
import PremiumWorlds from './components/PremiumWorlds'
import WeeklyEvents from './components/WeeklyEvents'
import GemStore from './components/GemStore'
import DebugMenu from './components/DebugMenu'
import OnboardingOverlay, { hasSeenOnboarding, markOnboardingSeen } from './components/OnboardingOverlay'
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
  }, [loadLevels, markLevelComplete])

  // Cross-device sync — when the JWT becomes available, pull-and-merge.
  // Each unique JWT triggers exactly one pull (the ref tracks which JWT we
  // already pulled for) so renders don't cause repeated network round-trips.
  useEffect(() => {
    if (!jwt) {
      didPullForJwt.current = null
      return
    }
    if (didPullForJwt.current === jwt) return
    didPullForJwt.current = jwt
    pullAndApply()
  }, [jwt])

  // Subscribe to both stores; any change after login schedules a debounced
  // push to /api/profile/sync. The debounce coalesces a flurry of changes
  // (level complete → gain score, hints, money) into one round-trip.
  useEffect(() => {
    if (!jwt) return
    const unsub1 = useGameStore.subscribe(() => schedulePush())
    const unsub2 = useProgressStore.subscribe(() => schedulePush())
    // Best-effort flush on tab unload so a pending push doesn't get lost
    // when the player closes the browser mid-debounce.
    const onUnload = () => { flushPush() }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      unsub1(); unsub2()
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
      <DebugMenu />
      {showOnboarding && (
        <OnboardingOverlay onDone={() => { markOnboardingSeen(); setShowOnboarding(false) }} />
      )}
    </>
  )
}
