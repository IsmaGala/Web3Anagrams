// Weekly events — max score across a fixed set of holes.
// Structure mirrors wordchain's WeeklyEvents.

import { useGameStore } from '../store/gameStore'
import { COURSES } from '../data/courseData'

// TODO: pull active event from server; this is a static stub.
const STUB_EVENT = {
  id: 'week_01',
  title: 'Ace Hunter',
  description: 'Get the lowest score across 3 holes. Best strokes-under-par wins.',
  endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString(),
  holes: COURSES[0]?.holes.slice(0, 3) ?? [],
  entryFee: 50,
  rewards: [
    { rank: '1st', prize: '🏆 Laser Club + 500 💎' },
    { rank: '2nd', prize: '500 💎' },
    { rank: '3rd', prize: '250 💎' },
  ],
}

export default function WeeklyEvents() {
  const goToWorldSelect = useGameStore(s => s.goToWorldSelect)
  const gemsBalance     = useGameStore(s => s.gemsBalance)
  const spendGems       = useGameStore(s => s.spendGems)

  function handleEnter() {
    if (gemsBalance < STUB_EVENT.entryFee) {
      alert(`Not enough gems. You need ${STUB_EVENT.entryFee} 💎.`)
      return
    }
    if (spendGems(STUB_EVENT.entryFee)) {
      alert('Entered! Play the event holes for your best score.')
    }
  }

  return (
    <div className="flex flex-col h-full w-full" style={{ background: 'linear-gradient(160deg, #1c1208, #0d0903)' }}>

      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button onClick={goToWorldSelect}
          className="font-fredoka text-lg px-3 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.08)', color: '#fde68a' }}>
          ←
        </button>
        <h1 className="font-fredoka text-3xl" style={{ color: '#fde68a' }}>🏆 EVENTS</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">

        {/* Active event card */}
        <div className="rounded-2xl p-5 mb-4" style={{ background: 'linear-gradient(160deg, #451a03, #1c0a00)', border: '3px solid #f59e0b' }}>
          <div className="font-fredoka text-2xl mb-1" style={{ color: '#fde68a' }}>{STUB_EVENT.title}</div>
          <p className="font-nunito font-bold text-sm mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>{STUB_EVENT.description}</p>
          <div className="font-nunito font-bold text-xs mb-4" style={{ color: '#f59e0b' }}>Ends {STUB_EVENT.endDate}</div>

          {/* Holes */}
          <div className="flex gap-2 mb-4">
            {STUB_EVENT.holes.map((h, i) => (
              <div key={h.id} className="flex-1 rounded-xl p-2 text-center" style={{ background: 'rgba(0,0,0,0.3)' }}>
                <div className="font-fredoka text-xl" style={{ color: '#fbbf24' }}>{i + 1}</div>
                <div className="font-nunito font-bold text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Par {h.par}</div>
              </div>
            ))}
          </div>

          {/* Rewards */}
          <div className="space-y-2 mb-4">
            {STUB_EVENT.rewards.map(r => (
              <div key={r.rank} className="flex items-center justify-between font-nunito font-bold text-sm"
                style={{ color: 'rgba(255,255,255,0.7)' }}>
                <span>{r.rank}</span><span style={{ color: '#fde68a' }}>{r.prize}</span>
              </div>
            ))}
          </div>

          <button
            onClick={handleEnter}
            className="btn-3d w-full py-3 font-fredoka text-xl"
            style={{
              background: 'linear-gradient(160deg, #92400e, #78350f)',
              border: '3px solid #f59e0b',
              borderBottom: '3px solid #451a03',
              boxShadow: '0 5px 0 #451a03',
              borderRadius: '16px',
              color: '#fde68a',
            }}
          >
            Enter · {STUB_EVENT.entryFee} 💎
          </button>
        </div>

        <p className="font-nunito font-bold text-center text-sm" style={{ color: 'rgba(255,255,255,0.25)' }}>
          New events unlock every Monday.
        </p>
      </div>
    </div>
  )
}
