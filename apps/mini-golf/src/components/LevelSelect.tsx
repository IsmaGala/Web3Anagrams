// Hole select — maps to levelSelect in wordchain.

import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { COURSE_MAP } from '../data/courseData'

const PAR_COLORS: Record<number, string> = {
  2: '#34d399',
  3: '#fbbf24',
  4: '#f87171',
  5: '#c084fc',
}

export default function LevelSelect() {
  const selectedCourseId  = useGameStore(s => s.selectedCourseId)
  const goToGame          = useGameStore(s => s.goToGame)
  const goToWorldSelect   = useGameStore(s => s.goToWorldSelect)
  const getBestStrokes    = useProgressStore(s => s.getBestStrokes)
  const isHoleComplete    = useProgressStore(s => s.isHoleComplete)

  const course = selectedCourseId ? COURSE_MAP.get(selectedCourseId) : null

  if (!course) {
    return (
      <div className="flex flex-col h-full items-center justify-center" style={{ background: '#0d1f0d' }}>
        <p className="text-white font-nunito">No course selected.</p>
        <button onClick={goToWorldSelect} className="mt-4 text-green-400 font-nunito font-bold">← Back</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full" style={{ background: 'linear-gradient(160deg, #1a3a1a, #0d1f0d)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button onClick={goToWorldSelect}
          className="font-fredoka text-lg px-3 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.08)', color: '#86efac' }}>
          ←
        </button>
        <div>
          <h1 className="font-fredoka text-3xl leading-none" style={{ color: '#4ade80' }}>
            {course.thumbnail} {course.name}
          </h1>
          <p className="font-nunito font-bold text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {course.holes.length} holes · Select a hole to play
          </p>
        </div>
      </div>

      {/* Hole list */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <div className="grid grid-cols-3 gap-3">
          {course.holes.map((hole, idx) => {
            const done  = isHoleComplete(course.id, hole.id)
            const best  = getBestStrokes(course.id, hole.id)
            const diff  = best !== null ? best - hole.par : null

            return (
              <button
                key={hole.id}
                onClick={() => goToGame(idx)}
                className="btn-3d flex flex-col items-center justify-center p-4 rounded-2xl"
                style={{
                  background: done
                    ? 'linear-gradient(160deg, #14532d, #052e16)'
                    : 'linear-gradient(160deg, #1f2937, #111827)',
                  border: `3px solid ${done ? '#4ade80' : 'rgba(255,255,255,0.12)'}`,
                  borderBottom: `3px solid ${done ? '#052e16' : 'rgba(0,0,0,0.4)'}`,
                  boxShadow: `0 4px 0 ${done ? '#052e16' : 'rgba(0,0,0,0.3)'}`,
                }}
              >
                <div className="font-fredoka text-2xl mb-1" style={{ color: done ? '#4ade80' : 'rgba(255,255,255,0.6)' }}>
                  {idx + 1}
                </div>
                <div className="font-nunito font-bold text-xs mb-1" style={{ color: PAR_COLORS[hole.par] ?? '#fff' }}>
                  Par {hole.par}
                </div>
                {done && best !== null && (
                  <div className="font-fredoka text-sm" style={{ color: diff !== null && diff <= 0 ? '#34d399' : '#fbbf24' }}>
                    {best} {diff !== null && diff < 0 ? `(${diff})` : diff === 0 ? '=' : `(+${diff})`}
                  </div>
                )}
                {!done && <div className="text-lg">⬜</div>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
