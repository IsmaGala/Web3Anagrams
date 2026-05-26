// Premium unlock screen — maps to PremiumWorlds in wordchain.

import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { COURSES } from '../data/courseData'

const PREMIUM_COST = 500

export default function PremiumCourses() {
  const goToWorldSelect = useGameStore(s => s.goToWorldSelect)
  const gemsBalance     = useGameStore(s => s.gemsBalance)
  const spendGems       = useGameStore(s => s.spendGems)
  const unlockCourse    = useProgressStore(s => s.unlockCourse)

  const premiumCourses = COURSES.filter(c => c.isPremium)

  function handleUnlock(courseId: string) {
    if (spendGems(PREMIUM_COST)) {
      unlockCourse(courseId)
      goToWorldSelect()
    } else {
      alert(`You need ${PREMIUM_COST} 💎 to unlock this course.`)
    }
  }

  return (
    <div className="flex flex-col h-full w-full" style={{ background: 'linear-gradient(160deg, #1a1a1a, #0d0d0d)' }}>

      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button onClick={goToWorldSelect}
          className="font-fredoka text-lg px-3 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.08)', color: '#e5e7eb' }}>
          ←
        </button>
        <h1 className="font-fredoka text-3xl" style={{ color: '#fbbf24' }}>⭐ PREMIUM COURSES</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
        {premiumCourses.map(course => (
          <div key={course.id} className="rounded-2xl p-5"
            style={{ background: 'linear-gradient(160deg, #1f1f00, #111100)', border: '3px solid #fbbf24' }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-4xl">{course.thumbnail}</span>
              <div>
                <div className="font-fredoka text-2xl" style={{ color: '#fde68a' }}>{course.name}</div>
                <div className="font-nunito font-bold text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {course.holes.length} holes
                </div>
              </div>
            </div>
            <p className="font-nunito font-bold text-sm mb-4" style={{ color: 'rgba(255,255,255,0.55)' }}>{course.description}</p>
            <button
              onClick={() => handleUnlock(course.id)}
              className="btn-3d w-full py-3 font-fredoka text-lg"
              style={{
                background: gemsBalance >= PREMIUM_COST ? 'linear-gradient(160deg, #78350f, #451a03)' : 'linear-gradient(160deg, #1f2937, #111827)',
                border: `3px solid ${gemsBalance >= PREMIUM_COST ? '#fbbf24' : 'rgba(255,255,255,0.1)'}`,
                borderBottom: '3px solid rgba(0,0,0,0.4)',
                boxShadow: '0 5px 0 rgba(0,0,0,0.3)',
                borderRadius: '16px',
                color: gemsBalance >= PREMIUM_COST ? '#fde68a' : 'rgba(255,255,255,0.3)',
              }}
            >
              Unlock for {PREMIUM_COST} 💎
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
