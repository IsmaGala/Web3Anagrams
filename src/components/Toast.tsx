import { useGameStore } from '../store/gameStore'

export default function Toast() {
  const toast = useGameStore(s => s.toast)
  return (
    <div className={`toast ${toast ? 'show' : ''}`}>
      {toast}
    </div>
  )
}
