import { useRef, useEffect, useCallback } from 'react'
import { useGameStore, selectActiveLetters } from '../store/gameStore'
import { useCosmeticsStore } from '../store/cosmeticsStore'
import { getWheelSkin, resolveRing, resolveConnector } from '../skins'
import { letterPosition } from '../utils/gameUtils'

const CANVAS_SIZE = 260

export default function Wheel() {
  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const containerRef   = useRef<HTMLDivElement>(null)
  // Letters come from the active source — server-shuffled manifest when in
  // server-authoritative mode, otherwise the legacy Level.letters.
  const letters        = useGameStore(selectActiveLetters)
  const selected       = useGameStore(s => s.selected)
  const gameMode       = useGameStore(s => s.gameMode)
  const startSelect    = useGameStore(s => s.startSelect)
  const continueSelect = useGameStore(s => s.continueSelect)
  const endSelect      = useGameStore(s => s.endSelect)

  // Cosmetics: pull the active skin id (a primitive string) so this
  // component re-renders on skin change without subscribing to the entire
  // skin object identity. The actual palette is resolved below via the
  // skins module — cheap, no allocation per render of any consequence.
  const skinId  = useCosmeticsStore(s => s.wheelSkin)
  const skin    = getWheelSkin(skinId)
  const isDaily = gameMode === 'daily'
  const ring    = resolveRing(skin, isDaily)
  const conn    = resolveConnector(skin, isDaily)

  // (letters provided above via selectActiveLetters)

  // Draw connector lines. Re-runs when the skin changes so a swap shows up
  // immediately on an already-in-progress drag, not just after the next
  // selection event.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    if (selected.length < 2 || !letters.length) return

    const grad = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    grad.addColorStop(0, conn.gradientStart)
    grad.addColorStop(1, conn.gradientEnd)

    ctx.strokeStyle = grad
    ctx.lineWidth   = 5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.shadowBlur  = 12
    ctx.shadowColor = conn.shadow
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
  }, [selected, letters, conn.gradientStart, conn.gradientEnd, conn.shadow])

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

  // We INTENTIONALLY do not early-return when letters.length === 0. In
  // server-authoritative mode, `letters` starts empty for the ~100ms window
  // between level entry and the /api/play/level/start response. Returning
  // null during that window unmounts the wheel container, then re-mounts it
  // when the response lands — causing the native touchstart/touchmove
  // listeners (attached via useEffect on the containerRef) to be re-bound
  // mid-interaction. Real devices handle the rebind fine, but Chrome's
  // DevTools mobile-emulation touch dispatcher gets confused by the
  // unmount/remount cycle and the wheel stops responding to simulated
  // touches. Keeping the container mounted continuously fixes emulation
  // without changing real-device behavior at all.

  return (
    <div ref={containerRef}
      data-skin={skin.id}
      className="wheel-root relative mx-auto mb-3"
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
      {/* Outer glow ring — driven by the active skin's `ring` palette so a
          new skin can recolor it without touching this component. */}
      <div className="wheel-ring absolute rounded-full pointer-events-none"
        style={{ top:'50%', left:'50%', transform:'translate(-50%,-50%)',
          width: 210, height: 210,
          border: `3px solid ${ring.border}`,
          boxShadow: `0 0 30px ${ring.glow}` }} />

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
