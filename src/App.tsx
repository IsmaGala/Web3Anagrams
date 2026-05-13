import { useEffect } from 'react'
import { useGameStore } from './store/gameStore'
import { useProgressStore } from './store/progressStore'
import { WORLDS } from './data/worldData'
import Splash from './components/Splash'
import WorldSelect from './components/WorldSelect'
import LevelSelect from './components/LevelSelect'
import GameBoard from './components/GameBoard'
import PremiumWorlds from './components/PremiumWorlds'
import WeeklyEvents from './components/WeeklyEvents'
import DebugMenu from './components/DebugMenu'
import './styles/global.css'

export default function App() {
  const screen     = useGameStore(s => s.screen)
  const loadLevels = useGameStore(s => s.loadLevels)
  const markLevelComplete = useProgressStore(s => s.markLevelComplete)

  useEffect(() => {
    const allLevels = WORLDS.flatMap(w => w.levels)
    loadLevels(allLevels)
    useGameStore.setState({
      _onLevelComplete: (worldId: string, levelIndex: number, score: number) => {
        markLevelComplete(worldId as any, levelIndex, score)
      }
    } as any)
  }, [loadLevels, markLevelComplete])

  return (
    <>
      {screen === 'splash'      && <Splash />}
      {screen === 'worldSelect' && <WorldSelect />}
      {screen === 'levelSelect' && <LevelSelect />}
      {screen === 'game'        && <GameBoard />}
      {screen === 'premium'     && <PremiumWorlds />}
      {screen === 'events'      && <WeeklyEvents />}
      <DebugMenu />
    </>
  )
}
