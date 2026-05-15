import { useRef, useEffect, useCallback } from 'react'
import { useGameStore, selectCurrentLevel } from '../store/gameStore'
import { letterPosition } from '../utils/gameUtils'

const CANVAS_SIZE = 260

export default function Wheel() {
  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const containerRef   = useRef<HTMLDivElement>(null)
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

  // We DON'T use React's onTouchMove because React registers touchmove as a
  // passive listener (since React 17), which means e.preventDefault() inside
  // the React handler is a no-op and the page still scrolls while the player
  // is swiping letters. Instead we attach a native non-passive listener to
  // the wheel container so preventDefault actually stops the scroll.
  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault()
    const touch = e.touches[0]
    if (!touch) return
    const els   = document.elementsFromPoint(touch.clientX, touch.clientY)
    const found = els.find(el => el.classList.contains('wheel-letter')) as HTMLElement | undefined
    if (found?.dataset.index !== undefined) continueSelect(parseInt(found.dataset.index))
  }, [continueSelect])

  // Mirror for touchstart — also passive in React's synthetic system, so we
  // attach natively to guarantee the initial tap can't be intercepted by
  // browser gestures (pull-to-refresh, long-press menu, etc.).
  const handleTouchStart = useCallback((e: TouchEvent) => {
    const target = e.target as HTMLElement | null
    const letterEl = target?.closest?.('.wheel-letter') as HTMLElement | undefined
    if (!letterEl || letterEl.dataset.index === undefined) return
    e.preventDefault()
    startSelect(parseInt(letterEl.dataset.index))
  }, [startSelect])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    // { passive: false } is the magic — without it, preventDefault is ignored
    // on touchmove and the page keeps scrolling while the player drags.
    node.addEventListener('touchstart', handleTouchStart, { passive: false })
    node.addEventListener('touchmove', handleTouchMove, { passive: false })
    return () => {
      node.removeEventListener('touchstart', handleTouchStart)
      node.removeEventListener('touchmove', handleTouchMove)
    }
  }, [handleTouchStart, handleTouchMove])

  useEffect(() => {
    document.addEventListener('mouseup', endSelect)
    document.addEventListener('touchend', endSelect)
    document.addEventListener('touchcancel', endSelect)
    return () => {
      document.removeEventListener('mouseup', endSelect)
      document.removeEventListener('touchend', endSelect)
      document.removeEventListener('touchcancel', endSelect)
    }
  }, [endSelect])

  if (!letters.length) return null

  return (
    <div ref={containerRef} className="relative mx-auto mb-3"
      style={{
        width: CANVAS_SIZE, height: CANVAS_SIZE,
        // touch-action:none tells the browser not to handle any default touch
        // gestures (scroll/zoom/pan) inside the wheel — combined with the
        // non-passive touchmove handler above, this kills the swipe/scroll
        // tug-of-war that made the game shift away from the player's finger.
        touchAction: 'none',
        // WebKit-specific: stops the iOS magnifying-glass / callout that can
        // hijack a drag and also disables tap highlight flashes.
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}>
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
            style={{ left: x, top: y, touchAction: 'none' }}
            onMouseDown={e => { e.preventDefault(); startSelect(i) }}
            onMouseOver={() => continueSelect(i)}>
            {ch}
          </div>
        )
      })}
    </div>
  )
}
