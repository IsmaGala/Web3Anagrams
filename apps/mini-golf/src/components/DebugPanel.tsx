// DebugPanel — development-only overlay for testing game state.
// Toggle with the 🐛 button fixed to the bottom-right corner.
// DO NOT ship in production without gating behind an env flag.

import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { COURSES } from '../data/courseData'

export default function DebugPanel() {
  const [open, setOpen] = useState(false)

  const gemsBalance  = useGameStore(s => s.gemsBalance)
  const earnGems     = useGameStore(s => s.earnGems)
  const spendGems    = useGameStore(s => s.spendGems)
  const wipeEconomy  = useGameStore(s => s.wipeEconomy)

  const isCourseUnlocked = useProgressStore(s => s.isCourseUnlocked)
  const unlockCourse     = useProgressStore(s => s.unlockCourse)
  const lockCourse       = useProgressStore(s => s.lockCourse)
  const resetProgress    = useProgressStore(s => s.reset)

  // Local gem-delta input
  const [gemInput, setGemInput] = useState('100')

  function handleGemChange(delta: number) {
    if (delta > 0) earnGems(delta)
    else spendGems(-delta)
  }

  const btnBase: React.CSSProperties = {
    padding: '4px 10px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.4,
  }

  return (
    <>
      {/* Toggle button — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed',
          bottom: 18,
          right: 18,
          zIndex: 9999,
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '2px solid #f97316',
          background: open ? '#f97316' : '#1c1917',
          color: '#fff',
          fontSize: 18,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
        }}
        title="Debug Panel"
      >
        🐛
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 68,
            right: 12,
            zIndex: 9998,
            width: 280,
            maxHeight: '75vh',
            overflowY: 'auto',
            background: 'rgba(10,10,10,0.96)',
            border: '1.5px solid #f97316',
            borderRadius: 12,
            padding: 14,
            color: '#e5e7eb',
            fontFamily: 'monospace',
            fontSize: 13,
            boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
          }}
        >
          <div style={{ color: '#f97316', fontWeight: 700, fontSize: 14, marginBottom: 12, letterSpacing: 1 }}>
            🐛 DEBUG PANEL
          </div>

          {/* ── Gems ──────────────────────────────────────────────────────── */}
          <section style={{ marginBottom: 14 }}>
            <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: 6 }}>
              💎 Gems — {gemsBalance}
            </div>

            {/* Quick presets */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {[50, 200, 1000].map(n => (
                <button
                  key={n}
                  onClick={() => earnGems(n)}
                  style={{ ...btnBase, background: '#16a34a', color: '#fff' }}
                >
                  +{n}
                </button>
              ))}
              {[50, 200].map(n => (
                <button
                  key={-n}
                  onClick={() => spendGems(n)}
                  style={{ ...btnBase, background: '#dc2626', color: '#fff' }}
                >
                  -{n}
                </button>
              ))}
            </div>

            {/* Custom delta */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number"
                value={gemInput}
                onChange={e => setGemInput(e.target.value)}
                style={{
                  width: 72,
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: '1px solid #374151',
                  background: '#111',
                  color: '#fff',
                  fontSize: 12,
                }}
              />
              <button
                onClick={() => handleGemChange(parseInt(gemInput) || 0)}
                style={{ ...btnBase, background: '#16a34a', color: '#fff' }}
              >
                +Give
              </button>
              <button
                onClick={() => handleGemChange(-(parseInt(gemInput) || 0))}
                style={{ ...btnBase, background: '#dc2626', color: '#fff' }}
              >
                −Take
              </button>
            </div>

            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => wipeEconomy()}
                style={{ ...btnBase, background: '#374151', color: '#f87171', width: '100%' }}
              >
                Set Gems → 0
              </button>
            </div>
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid #374151', margin: '10px 0' }} />

          {/* ── Courses ───────────────────────────────────────────────────── */}
          <section style={{ marginBottom: 14 }}>
            <div style={{ color: '#a78bfa', fontWeight: 700, marginBottom: 8 }}>
              🏌️ Course Lock / Unlock
            </div>
            {COURSES.map(course => {
              const unlocked = isCourseUnlocked(course.id)
              return (
                <div
                  key={course.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 7,
                    padding: '5px 8px',
                    borderRadius: 8,
                    background: unlocked ? 'rgba(22,163,74,0.15)' : 'rgba(220,38,38,0.12)',
                    border: `1px solid ${unlocked ? '#166534' : '#7f1d1d'}`,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{course.thumbnail}</span>
                    <span style={{ color: unlocked ? '#86efac' : '#fca5a5' }}>
                      {course.name}
                    </span>
                    {course.isPremium && (
                      <span style={{ fontSize: 10, color: '#fbbf24', background: '#78350f', padding: '1px 5px', borderRadius: 4 }}>
                        PRO
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => unlocked ? lockCourse(course.id) : unlockCourse(course.id)}
                    style={{
                      ...btnBase,
                      background: unlocked ? '#7f1d1d' : '#14532d',
                      color: unlocked ? '#fca5a5' : '#86efac',
                      minWidth: 62,
                    }}
                  >
                    {unlocked ? '🔒 Lock' : '🔓 Unlock'}
                  </button>
                </div>
              )
            })}
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid #374151', margin: '10px 0' }} />

          {/* ── Danger zone ───────────────────────────────────────────────── */}
          <section>
            <div style={{ color: '#f87171', fontWeight: 700, marginBottom: 8 }}>
              ⚠️ Danger Zone
            </div>
            <button
              onClick={() => {
                if (confirm('Reset ALL progress? This cannot be undone.')) resetProgress()
              }}
              style={{ ...btnBase, background: '#7f1d1d', color: '#fca5a5', width: '100%', padding: '6px 10px' }}
            >
              Reset All Progress
            </button>
          </section>
        </div>
      )}
    </>
  )
}
