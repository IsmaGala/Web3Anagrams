// Course select — choose a course to play.

import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { COURSES } from '../data/courseData'

export default function WorldSelect() {
  const goToSplash       = useGameStore(s => s.goToSplash)
  const goToLevelSelect  = useGameStore(s => s.goToLevelSelect)
  const goToPremium      = useGameStore(s => s.goToPremium)
  const isCourseUnlocked = useProgressStore(s => s.isCourseUnlocked)

  return (
    <div className="flex flex-col h-full w-full" style={{ background: 'linear-gradient(160deg, #1a3a1a, #0d1f0d)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <button
          onClick={goToSplash}
          className="px-3 py-2 rounded-xl font-nunito font-bold text-sm"
          style={{ background: 'rgba(255,255,255,0.08)', color: '#86efac', border: '1px solid rgba(134,239,172,0.3)' }}
        >
          ‹ Back
        </button>
        <h1 className="font-fredoka text-3xl" style={{ color: '#4ade80' }}>⛳ COURSES</h1>
      </div>

      {/* Course grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <div className="grid grid-cols-2 gap-3">
          {COURSES.map(course => {
            const unlocked = isCourseUnlocked(course.id)
            return (
              <button
                key={course.id}
                onClick={() => unlocked ? goToLevelSelect(course.id) : goToPremium()}
                className="btn-3d relative flex flex-col items-center justify-center p-5 rounded-2xl text-left"
                style={{
                  background: unlocked
                    ? 'linear-gradient(160deg, #166534, #14532d)'
                    : 'linear-gradient(160deg, #1f2937, #111827)',
                  border: `3px solid ${unlocked ? '#4ade80' : 'rgba(255,255,255,0.1)'}`,
                  borderBottom: `3px solid ${unlocked ? '#052e16' : 'rgba(0,0,0,0.4)'}`,
                  boxShadow: `0 5px 0 ${unlocked ? '#052e16' : 'rgba(0,0,0,0.3)'}`,
                  opacity: unlocked ? 1 : 0.7,
                }}
              >
                <div className="text-4xl mb-2">{course.thumbnail}</div>
                <div className="font-fredoka text-lg leading-tight mb-1" style={{ color: unlocked ? '#fff' : 'rgba(255,255,255,0.5)' }}>
                  {course.name}
                </div>
                <div className="font-nunito font-bold text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {course.holes.length} holes
                </div>
                {!unlocked && (
                  <div className="absolute top-2 right-2 text-yellow-400 text-lg">🔒</div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
