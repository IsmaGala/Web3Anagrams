import { useEffect } from 'react'
import { registerDisconnectHandler } from '@gala-games/metagame'
import { useGameStore } from './store/gameStore'
import { useProgressStore } from './store/progressStore'
import { useCosmeticsStore } from './store/cosmeticsStore'
import { flushPush, cancelPendingPush, pullAndApply } from './utils/profileSync'
import { useWalletStore } from '@gala-games/metagame'
import Splash from './components/Splash'
import WorldSelect from './components/WorldSelect'
import LevelSelect from './components/LevelSelect'
import GameBoard from './components/GameBoard'
import PremiumCourses from './components/PremiumCourses'
import WeeklyEvents from './components/WeeklyEvents'
import GemStore from './components/GemStore'
import Wardrobe from './components/Wardrobe'
import Toast from './components/Toast'
import DebugPanel from './components/DebugPanel'
import './styles/global.css'

// Register the disconnect handler — wipes all game state and returns to splash.
registerDisconnectHandler(async (_jwt) => {
  await flushPush().catch(() => {})
  cancelPendingPush()
  useProgressStore.getState().reset()
  useCosmeticsStore.getState().reset()
  useGameStore.getState().wipeEconomy()
  cancelPendingPush()
  useGameStore.getState().goToSplash()
})

export default function App() {
  const screen = useGameStore(s => s.screen)
  const jwt    = useWalletStore(s => s.jwt)

  // Cross-device sync: pull on login
  useEffect(() => {
    if (jwt) pullAndApply().catch(() => {})
  }, [jwt])

  return (
    <div className="app-root">
      {screen === 'splash'       && <Splash />}
      {screen === 'worldSelect'  && <WorldSelect />}
      {screen === 'levelSelect'  && <LevelSelect />}
      {screen === 'game'         && <GameBoard />}
      {screen === 'premium'      && <PremiumCourses />}
      {screen === 'events'       && <WeeklyEvents />}
      {screen === 'store'        && <GemStore />}
      {screen === 'wardrobe'     && <Wardrobe />}
      <Toast />
      <DebugPanel />
    </div>
  )
}
