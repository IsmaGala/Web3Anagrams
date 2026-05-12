import { useRef, useEffect, useCallback } from 'react'
import { useGameStore, selectCurrentLevel } from '../store/gameStore'
import { letterPosition } from '../utils/gameUtils'

const CANVAS_SIZE = 260

export default function Wheel() {
  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const level          = useGameStore(selectCurrentLevel)
  const selected       = useGameStore(s => s.selected)
  const gameMode       = useGameStore(s => s.gameMode)
  const startSelect    = useGameStore(s => s.startSelect)
  const continueSelect = useGameStore(s => s.continueSelect)
  const endSelect      = useGameStore(s => s.endSelect)

  const letters = level?.letters ?? []

  // Draw connector lines
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    if (selected.length < 2 || !letters.length) return

    const grad = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    if (gameMode === 'daily') {
      grad.addColorStop(0, 'rgba(251,191,36,0.9)')
      grad.addColorStop(1, 'rgba(249,115,22,0.9)')
    } else {
      grad.addColorStop(0, 'rgba(196,181,253,0.9)')
      grad.addColorStop(1, 'rgba(124,58,237,0.9)')
    }

    ctx.strokeStyle = grad
    ctx.lineWidth   = 5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.shadowBlur  = 12
    ctx.shadowColor = gameMode === 'daily' ? 'rgba(251,191,36,0.6)' : 'rgba(167,139,250,0.6)'
    ctx.beginPath()

    selected.forEach((idx, si) => {
      const { x, y } = letterPosition(idx, letters.length)
      // scale to 260 canvas (letterPosition uses 240 base)
      const sx = x / 240 * CANVAS_SIZE
      const sy = y / 240 * CANVAS_SIZE
      if (si === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    })
    ctx.stroke()
  }, [selected, letters, gameMode])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    const touch = e.touches[0]
    const els   = document.elementsFromPoint(touch.clientX, touch.clientY)
    const found = els.find(el => el.classList.contains('wheel-letter')) as HTMLElement | undefined
    if (found?.dataset.index !== undefined) continueSelect(parseInt(found.dataset.index))
  }, [continueSelect])

  useEffect(() => {
    document.addEventListener('mouseup', endSelect)
    document.addEventListener('touchend', endSelect)
    return () => {
      document.removeEventListener('mouseup', endSelect)
      document.removeEventListener('touchend', endSelect)
    }
  }, [endSelect])

  if (!letters.length) return null

  return (
    <div className="relative mx-auto mb-3" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}>
      {/* Outer glow ring */}
      <div className="absolute rounded-full pointer-events-none"
        style={{ top:'50%', left:'50%', transform:'translate(-50%,-50%)',
          width: 210, height: 210,
          border: `3px solid ${gameMode === 'daily' ? 'rgba(245,158,11,0.2)' : 'rgba(124,58,237,0.2)'}`,
          boxShadow: `0 0 30px ${gameMode === 'daily' ? 'rgba(245,158,11,0.1)' : 'rgba(124,58,237,0.1)'}` }} />

      <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE}
        className="absolute inset-0 pointer-events-none" />

      {letters.map((ch, i) => {
        // Scale positions to match 260 canvas
        const pos260 = letterPosition(i, letters.length)
        const x = pos260.x / 240 * CANVAS_SIZE
        const y = pos260.y / 240 * CANVAS_SIZE
        const isSelected = selected.includes(i)

        return (
          <div key={i} data-index={i}
            className={`wheel-letter ${isSelected ? 'selected' : ''}`}
            style={{ left: x, top: y }}
            onMouseDown={e => { e.preventDefault(); startSelect(i) }}
            onMouseOver={() => continueSelect(i)}
            onTouchStart={e => { e.preventDefault(); startSelect(i) }}
            onTouchMove={handleTouchMove}>
            {ch}
          </div>
        )
      })}
    </div>
  )
}
