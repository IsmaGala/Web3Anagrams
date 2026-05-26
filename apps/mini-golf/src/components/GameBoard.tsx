// ─────────────────────────────────────────────────────────────────────────────
// GameBoard — top-down mini golf canvas.
//
// Architecture:
//   • A single <canvas> element fills the screen.
//   • Matter.js handles physics: ball (circle), walls (rectangles), obstacles.
//   • Pointer drag determines shot direction + power. The club sprite
//     rotates around the ball tracking the pointer.
//   • On pointer-up the ball receives an impulse proportional to drag length.
//   • Hole detection: when the ball centre is within HOLE_RADIUS of the cup
//     AND ball speed < SINK_SPEED, the hole is marked complete.
//
// TODO (next iteration):
//   [ ] Replace placeholder rendering with themed sprite sheets
//   [x] Windmill obstacle: compound blade body, rotated each frame via setAngle
//   [ ] Add sand friction zone (Matter.js frictionAir override while inside)
//   [ ] Add water zone respawn
//   [ ] Animate ball trail using the cosmetics store ball color
//   [ ] Animate club sprite using cosmetics store club color
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import Matter from 'matter-js'
import { playSfx } from '@gala-games/metagame'
import { useGameStore } from '../store/gameStore'
import { useProgressStore } from '../store/progressStore'
import { useCosmeticsStore } from '../store/cosmeticsStore'
import { COURSE_MAP } from '../data/courseData'
import { BALL_ITEMS, CLUB_ITEMS } from '../store/cosmeticsStore'
import type { Vec2, Wall, Obstacle, ForceEmitter } from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────

const BALL_RADIUS    = 10
const HOLE_RADIUS    = 14
const SINK_SPEED     = 3.0   // px/frame; generous so near-misses still sink
const MAX_POWER      = 220   // max impulse magnitude
const DRAG_SCALE     = 0.55  // canvas-px drag → impulse multiplier
const CLUB_LENGTH    = 48
const CLUB_WIDTH     = 6
const FRICTION_AIR   = 0.030  // heavier air drag for a more controllable feel
const RESTITUTION    = 0.40  // bounciness

// ── Rendering helpers ─────────────────────────────────────────────────────────

// Subtle fairway — draws only inside the boundary walls with a very low-contrast checker.
// Inner play area: x 40-340, y 60-580 (hard-coded to match BORDER wall positions).
function drawFairway(ctx: CanvasRenderingContext2D) {
  const fx = 40, fy = 60, fw = 300, fh = 520
  ctx.fillStyle = '#4ba226'
  ctx.fillRect(fx, fy, fw, fh)
  // Overlay every other 26px cell with a very faint dark tint
  const size = 26
  ctx.fillStyle = 'rgba(0,0,0,0.055)'
  for (let row = 0; row * size < fh; row++) {
    for (let col = 0; col * size < fw; col++) {
      if ((row + col) % 2 === 0) {
        ctx.fillRect(
          fx + col * size, fy + row * size,
          Math.min(size, fw - col * size), Math.min(size, fh - row * size),
        )
      }
    }
  }
}

// ── Contextual backgrounds ─────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, theme: string, w: number, h: number, frame: number) {
  if (theme === 'ocean') {
    // Deep-water base
    ctx.fillStyle = '#0f5c96'
    ctx.fillRect(0, 0, w, h)
    // Animated sine waves in outer margin strips
    for (let i = 0; i < 16; i++) {
      const baseY = (h / 16) * i
      ctx.beginPath()
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + (i % 3) * 0.02})`
      ctx.lineWidth = 1.5
      for (let x = 0; x <= w; x += 4) {
        const y = baseY + Math.sin((x / 32) + frame * 0.045 + i * 0.9) * 5
        if (x === 0) ctx.moveTo(x, y) ; else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    // Tiny foam bubbles floating upward
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    for (let i = 0; i < 9; i++) {
      const bx = ((w * 0.11 * i) + frame * 0.4) % w
      const by = ((h * 0.13 * i + frame * 0.6) % h)
      ctx.beginPath()
      ctx.arc(bx, by, 1.5 + (i % 3), 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (theme === 'space') {
    ctx.fillStyle = '#07071a'
    ctx.fillRect(0, 0, w, h)
    // Twinkling stars in margin area
    const starPos = [
      [14,85],[362,115],[18,280],[365,390],[22,500],[360,560],
      [95,14],[190,20],[285,12],[90,628],[195,622],[290,630],
    ]
    for (let i = 0; i < starPos.length; i++) {
      const [sx, sy] = starPos[i]
      const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(frame * 0.04 + i * 1.4))
      ctx.globalAlpha = twinkle
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(sx, sy, 1 + (i % 3) * 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  } else {
    // Forest — dark-green border with layered tree sprites
    ctx.fillStyle = '#24560e'
    ctx.fillRect(0, 0, w, h)
    // Pre-placed trees along all four margin strips
    const trees = [
      // left strip
      [30,90],[27,200],[32,320],[28,440],[31,555],
      // right strip
      [350,110],[354,230],[348,360],[352,480],[351,575],
      // top strip
      [75,28],[155,22],[235,30],[310,25],
      // bottom strip
      [72,614],[155,618],[238,610],[314,616],
    ]
    for (const [tx, ty] of trees) {
      // trunk
      ctx.fillStyle = '#4a2808'
      ctx.fillRect(tx - 2, ty + 5, 4, 8)
      // canopy layers
      ctx.fillStyle = '#173e06'
      ctx.beginPath(); ctx.arc(tx, ty, 11, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#22620d'
      ctx.beginPath(); ctx.arc(tx - 2, ty - 4, 8, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#2e8012'
      ctx.beginPath(); ctx.arc(tx + 1, ty - 1, 6, 0, Math.PI * 2); ctx.fill()
    }
  }
}

function drawWall(ctx: CanvasRenderingContext2D, wall: Wall) {
  ctx.save()
  ctx.translate(wall.x + wall.w / 2, wall.y + wall.h / 2)
  ctx.rotate(wall.angle ?? 0)
  ctx.fillStyle = '#f0ede8'
  ctx.fillRect(-wall.w / 2, -wall.h / 2, wall.w, wall.h)
  // bevel shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.fillRect(-wall.w / 2, wall.h / 2 - 4, wall.w, 4)
  ctx.restore()
}

function drawObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle, frame = 0) {
  ctx.save()
  ctx.translate(obs.x, obs.y)
  if (obs.type === 'box') {
    ctx.fillStyle = '#b45309'
    ctx.fillRect(-18, -18, 36, 36)
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 3
    ctx.strokeRect(-18, -18, 36, 36)
    // X marking
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(-12, -12); ctx.lineTo(12, 12); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(12, -12); ctx.lineTo(-12, 12); ctx.stroke()
  } else if (obs.type === 'bumper') {
    ctx.beginPath()
    ctx.arc(0, 0, 16, 0, Math.PI * 2)
    ctx.fillStyle = '#f59e0b'
    ctx.fill()
    ctx.strokeStyle = '#b45309'
    ctx.lineWidth = 3
    ctx.stroke()
  } else if (obs.type === 'windmill') {
    const speed    = obs.speed ?? 1.0
    const angle    = (frame * speed) / 60
    const bladeLen = 38
    const bladeW   = 10
    const numBlades = 4
    // Rotating blades
    ctx.save()
    ctx.rotate(angle)
    for (let i = 0; i < numBlades; i++) {
      ctx.save()
      ctx.rotate((Math.PI * 2 / numBlades) * i)
      // Blade shadow
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.fillRect(3, -bladeW / 2 + 3, bladeLen, bladeW)
      // Blade body
      const grad = ctx.createLinearGradient(0, 0, bladeLen, 0)
      grad.addColorStop(0, '#ef4444')
      grad.addColorStop(1, '#b91c1c')
      ctx.fillStyle = grad
      ctx.fillRect(0, -bladeW / 2, bladeLen, bladeW)
      // Blade edge highlight
      ctx.strokeStyle = '#fca5a5'
      ctx.lineWidth = 1
      ctx.strokeRect(0, -bladeW / 2, bladeLen, bladeW)
      ctx.restore()
    }
    ctx.restore()
    // Central hub
    ctx.beginPath()
    ctx.arc(0, 0, 9, 0, Math.PI * 2)
    ctx.fillStyle = '#1f2937'
    ctx.fill()
    ctx.strokeStyle = '#6b7280'
    ctx.lineWidth = 2.5
    ctx.stroke()
    // Hub bolt
    ctx.beginPath()
    ctx.arc(0, 0, 3, 0, Math.PI * 2)
    ctx.fillStyle = '#9ca3af'
    ctx.fill()
  }
  ctx.restore()
}

function drawHole(ctx: CanvasRenderingContext2D, pos: Vec2) {
  // Shadow
  ctx.beginPath()
  ctx.arc(pos.x + 2, pos.y + 2, HOLE_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fill()
  // Cup
  ctx.beginPath()
  ctx.arc(pos.x, pos.y, HOLE_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = '#111'
  ctx.fill()
  // Flag pole
  ctx.strokeStyle = '#dc2626'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(pos.x, pos.y - HOLE_RADIUS)
  ctx.lineTo(pos.x, pos.y - HOLE_RADIUS - 26)
  ctx.stroke()
  // Flag
  ctx.fillStyle = '#dc2626'
  ctx.beginPath()
  ctx.moveTo(pos.x, pos.y - HOLE_RADIUS - 26)
  ctx.lineTo(pos.x + 14, pos.y - HOLE_RADIUS - 20)
  ctx.lineTo(pos.x, pos.y - HOLE_RADIUS - 14)
  ctx.fill()
}

function drawForceEmitter(ctx: CanvasRenderingContext2D, fe: ForceEmitter, frame: number) {
  const { x, y, angle, strength, radius } = fe
  // Color palette: gentle (green) → medium (yellow) → strong (orange/red)
  const t = Math.min(strength / 0.0014, 1)   // normalise ~0–0.0014 to 0-1
  const r = Math.round(60  + t * 195)
  const g = Math.round(220 - t * 130)
  const b = 40
  const baseColor  = `rgb(${r},${g},${b})`
  const glowColor  = `rgba(${r},${g},${b},0.18)`

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)

  // Ground pad — soft glowing circle
  const grad = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius)
  grad.addColorStop(0, glowColor)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()

  // Animated chevron arrows moving toward the emitter direction
  const pulse = (frame * 2) % 60   // 0-59 looping
  const arrowCount = 3
  const spacing    = (radius * 1.6) / arrowCount
  const baseOffset = -(spacing * (arrowCount - 1)) / 2

  for (let i = 0; i < arrowCount; i++) {
    // Each arrow marches forward; older ones fade out
    const progress = ((pulse / 60) + i / arrowCount) % 1  // 0→1 scroll
    const alpha    = Math.sin(progress * Math.PI) * 0.85 + 0.15
    const offset   = baseOffset + i * spacing + progress * spacing - spacing / 2

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = baseColor
    ctx.lineWidth   = 3
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    // Chevron: two lines forming a >
    const hw = 8   // half-width
    const d  = 7   // depth
    ctx.beginPath()
    ctx.moveTo(offset - d, -hw)
    ctx.lineTo(offset + d,   0)
    ctx.lineTo(offset - d,  hw)
    ctx.stroke()
    ctx.restore()
  }

  // Direction indicator dot at tip
  const tipAlpha = 0.5 + 0.5 * Math.sin(frame * 0.12)
  ctx.save()
  ctx.globalAlpha = tipAlpha
  ctx.fillStyle   = baseColor
  ctx.beginPath()
  ctx.arc(radius * 0.65, 0, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.restore()
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  pos: Vec2,
  vel: Vec2,
  squash: number,      // 0-1: hit-squash intensity (decays after shot)
  squashAngle: number, // angle of the shot that caused the squash
  color: string,
  trailColor: string,
  trail: Vec2[],
) {
  const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2)

  // ── Compute ellipse radii + orientation ──────────────────────────────────
  let rx: number, ry: number, angle: number

  if (squash > 0.04) {
    // Brief squash on impact: flatten in shot direction, puff perpendicular
    rx = BALL_RADIUS * (1 - squash * 0.28)
    ry = BALL_RADIUS * (1 + squash * 0.42)
    angle = squashAngle
  } else if (speed > 0.4) {
    // Stretch in direction of travel proportional to speed
    const s = Math.min(speed / 10, 1) * 0.50
    rx = BALL_RADIUS * (1 + s)
    ry = BALL_RADIUS * Math.max(0.55, 1 - s * 0.45)
    angle = Math.atan2(vel.y, vel.x)
  } else {
    rx = BALL_RADIUS
    ry = BALL_RADIUS
    angle = 0
  }

  // ── Trail ─────────────────────────────────────────────────────────────────
  if (trail.length > 1) {
    ctx.beginPath()
    ctx.moveTo(trail[0].x, trail[0].y)
    for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y)
    ctx.strokeStyle = trailColor
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.globalAlpha = 0.5
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // ── Shadow (stretched ellipse) ────────────────────────────────────────────
  ctx.beginPath()
  ctx.ellipse(pos.x + 2, pos.y + 2, rx, ry, angle, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.fill()

  // ── Ball body (stretched ellipse + radial gradient) ───────────────────────
  ctx.beginPath()
  ctx.ellipse(pos.x, pos.y, rx, ry, angle, 0, Math.PI * 2)
  const grad = ctx.createRadialGradient(pos.x - 3, pos.y - 3, 1, pos.x, pos.y, BALL_RADIUS)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(1, color)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawClub(ctx: CanvasRenderingContext2D, ballPos: Vec2, angle: number, power: number, color: string) {
  const dist = BALL_RADIUS + 6 + Math.min(power * 0.3, 24)
  const tipX = ballPos.x + Math.cos(angle) * dist
  const tipY = ballPos.y + Math.sin(angle) * dist
  const headX = tipX + Math.cos(angle) * CLUB_LENGTH
  const headY = tipY + Math.sin(angle) * CLUB_LENGTH
  // Shaft
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(headX, headY)
  ctx.strokeStyle = color
  ctx.lineWidth = CLUB_WIDTH
  ctx.lineCap = 'round'
  ctx.stroke()
  // Head accent
  ctx.beginPath()
  ctx.arc(headX, headY, CLUB_WIDTH + 2, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  // Power bar (pull-back indicator)
  if (power > 0) {
    const barW = 60
    const filled = (power / MAX_POWER) * barW
    const bx = ballPos.x - barW / 2
    const by = ballPos.y + 22
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(bx - 1, by - 1, barW + 2, 8)
    const hue = power > MAX_POWER * 0.7 ? '#ef4444' : power > MAX_POWER * 0.4 ? '#f59e0b' : '#34d399'
    ctx.fillStyle = hue
    ctx.fillRect(bx, by, filled, 6)
  }
}


// ── Particle system ──────────────────────────────────────────────────────────

interface Particle {
  x: number; y: number
  vx: number; vy: number
  life: number   // 1 → 0
  decay: number  // per-frame life reduction
  size: number
  color: string
}

interface ImpactRing {
  x: number; y: number
  r: number      // current radius
  maxR: number   // target radius
  life: number   // 1 → 0
  color: string
}

interface ConfettiPiece {
  x: number; y: number
  vx: number; vy: number
  rotation: number
  rotSpeed: number
  w: number; h: number
  life: number   // 1 → 0 (slow decay, ~2 s)
  decay: number
  color: string
}

function spawnConfetti(pieces: ConfettiPiece[], cx: number, cy: number) {
  const colors = [
    '#ef4444', '#f97316', '#fbbf24', '#22c55e',
    '#3b82f6', '#a855f7', '#ec4899', '#ffffff', '#fde68a',
  ]
  for (let i = 0; i < 55; i++) {
    // Spray mostly upward with wide spread
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4
    const spd   = 2.5 + Math.random() * 5.5
    pieces.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.28,
      w: 6 + Math.random() * 7,
      h: 3 + Math.random() * 4,
      life: 1,
      decay: 0.007 + Math.random() * 0.006,  // ~120-140 frames ≈ 2 s
      color: colors[Math.floor(Math.random() * colors.length)],
    })
  }
}

function spawnParticles(
  particles: Particle[],
  rings: ImpactRing[],
  cx: number, cy: number,
  isBumper: boolean,
  isObstacle: boolean,
) {
  const count  = isBumper ? 12 : isObstacle ? 8 : 7
  const colors = isBumper
    ? ['#fde68a', '#fbbf24', '#f59e0b', '#ffffff', '#fef3c7', '#fb923c']
    : isObstacle
    ? ['#d97706', '#b45309', '#92400e', '#fbbf24', '#78350f']
    : ['#e5e7eb', '#d1d5db', '#ffffff', '#f3f4f6', '#e0e7ef', '#bfdbfe']
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const spd   = 1.5 + Math.random() * 3.5
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: 1,
      decay: 0.045 + Math.random() * 0.035,
      size: 2.5 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
    })
  }
  // Impact ring burst
  rings.push({
    x: cx, y: cy,
    r: 3, maxR: isBumper ? 26 : 18,
    life: 1,
    color: isBumper ? '#fbbf24' : isObstacle ? '#d97706' : 'rgba(255,255,255,0.9)',
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GameBoard() {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const engineRef    = useRef<Matter.Engine | null>(null)
  const ballBodyRef  = useRef<Matter.Body | null>(null)
  const trailRef     = useRef<Vec2[]>([])
  const rafRef       = useRef<number>(0)
  const dragStart    = useRef<Vec2 | null>(null)
  const dragCurrent  = useRef<Vec2 | null>(null)
  const isDragging     = useRef(false)
  const particlesRef        = useRef<Particle[]>([])
  const ringsRef            = useRef<ImpactRing[]>([])
  const confettiRef         = useRef<ConfettiPiece[]>([])
  const confettiSpawnedRef  = useRef(false)
  const [overlayVisible, setOverlayVisible] = useState(false)
  const hitSquashRef   = useRef(0)          // 1 on shot, decays each frame
  const shotAngleRef   = useRef(0)          // direction of last shot (radians)

  // Store selectors
  const selectedCourseId  = useGameStore(s => s.selectedCourseId)
  const selectedHoleIndex = useGameStore(s => s.selectedHoleIndex)
  const isHoleComplete    = useGameStore(s => s.isHoleComplete)
  const currentShots      = useGameStore(s => s.currentShots)
  const recordShot        = useGameStore(s => s.recordShot)
  const completeHole      = useGameStore(s => s.completeHole)
  const ballSkinId        = useCosmeticsStore(s => s.ballSkin)
  const clubSkinId        = useCosmeticsStore(s => s.clubSkin)
  const recordHoleResult  = useProgressStore(s => s.recordHoleResult)

  const course = selectedCourseId ? COURSE_MAP.get(selectedCourseId) : null
  const hole   = course ? course.holes[selectedHoleIndex] : null

  // ── State ref ─────────────────────────────────────────────────────────────
  // The RAF loop reads from this ref every frame so it always has current
  // values without being a dep of the useEffect (which would restart physics).
  const live = useRef({
    isHoleComplete, currentShots, selectedCourseId,
    ballSkinId, clubSkinId,
    completeHole, recordHoleResult,
  })
  useEffect(() => {
    live.current = {
      isHoleComplete, currentShots, selectedCourseId,
      ballSkinId, clubSkinId,
      completeHole, recordHoleResult,
    }
  })

  // ── Delay hole-complete overlay by 2 s to let confetti play ─────────────
  useEffect(() => {
    if (!isHoleComplete) {
      setOverlayVisible(false)
      return
    }
    const t = setTimeout(() => setOverlayVisible(true), 2000)
    return () => clearTimeout(t)
  }, [isHoleComplete])

  // ── Physics + RAF — only recreated when the hole changes ──────────────────
  useEffect(() => {
    if (!hole) return
    confettiSpawnedRef.current = false   // reset for new hole
    const h = hole   // narrowed non-null for closures

    // --- Physics setup ---
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } })
    engineRef.current = engine

    const ball = Matter.Bodies.circle(h.ball.x, h.ball.y, BALL_RADIUS, {
      restitution: RESTITUTION,
      frictionAir: FRICTION_AIR,
      friction: 0.01,
      label: 'ball',
    })
    ballBodyRef.current = ball

    const wallBodies = h.walls.map(w =>
      Matter.Bodies.rectangle(
        w.x + w.w / 2, w.y + w.h / 2, w.w, w.h,
        { isStatic: true, restitution: RESTITUTION, label: 'wall', angle: w.angle ?? 0 },
      )
    )
    // windmill bodies stored separately so we can rotate them each frame
    const windmillBodies: Array<{ body: Matter.Body; speed: number }> = []

    const obstacleBodies = h.obstacles.flatMap(obs => {
      if (obs.type === 'box')
        return [Matter.Bodies.rectangle(obs.x, obs.y, 36, 36, { isStatic: true, restitution: 0.7, label: 'obstacle' })]
      if (obs.type === 'bumper')
        return [Matter.Bodies.circle(obs.x, obs.y, 16, { isStatic: true, restitution: 1.2, label: 'bumper' })]
      if (obs.type === 'windmill') {
        // Compound body: two crossed rectangles (blades) + hub circle.
        // isStatic so it doesn't fall; we rotate it manually each frame.
        const bladeLen = 38
        const bladeW   = 10
        const blade1   = Matter.Bodies.rectangle(obs.x, obs.y, bladeLen * 2, bladeW)
        const blade2   = Matter.Bodies.rectangle(obs.x, obs.y, bladeW, bladeLen * 2)
        const hub      = Matter.Bodies.circle(obs.x, obs.y, 9)
        const body     = Matter.Body.create({
          isStatic: true,
          restitution: 0.5,
          friction: 0,
          label: 'windmill',
          parts: [blade1, blade2, hub],
        })
        windmillBodies.push({ body, speed: obs.speed ?? 1.0 })
        return [body]
      }
      return []
    })
    Matter.World.add(engine.world, [ball, ...wallBodies, ...obstacleBodies])

    Matter.Events.on(engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const a = pair.bodyA.label, b = pair.bodyB.label
        const isBallHit  = (a === 'ball' || b === 'ball')
        const isWall     = (a === 'wall'     || b === 'wall')
        const isBumper   = (a === 'bumper'   || b === 'bumper')
        const isObstacle = (a === 'obstacle' || b === 'obstacle')
        if (isBallHit && (isWall || isBumper || isObstacle)) {
          playSfx('wallHit')
          // Contact point: average of active contact vertices, fallback to ball pos
          const contacts = pair.activeContacts as Array<{ vertex: { x: number; y: number } }>
          const ballBody = a === 'ball' ? pair.bodyA : pair.bodyB
          const cx = contacts && contacts.length > 0
            ? contacts.reduce((s, c) => s + c.vertex.x, 0) / contacts.length
            : ballBody.position.x
          const cy = contacts && contacts.length > 0
            ? contacts.reduce((s, c) => s + c.vertex.y, 0) / contacts.length
            : ballBody.position.y
          spawnParticles(particlesRef.current, ringsRef.current, cx, cy, isBumper, isObstacle)
        }
      }
    })

    // Capture theme for background drawing (stable per course)
    const theme = course?.theme ?? 'forest'
    let frame = 0

    // --- RAF loop (stable closure — reads live ref every frame) ---
    let rafId: number
    function loop() {
      frame++
      const canvas = canvasRef.current
      const eng    = engineRef.current
      const bl     = ballBodyRef.current
      if (!canvas || !eng || !bl) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Read live state BEFORE physics so completion freeze takes effect immediately
      const { isHoleComplete, currentShots, selectedCourseId,
              ballSkinId, clubSkinId, completeHole, recordHoleResult } = live.current

      // ── Windmill rotation (kinematic) ────────────────────────────────────
      for (const wm of windmillBodies) {
        const angle = (frame * wm.speed) / 60
        Matter.Body.setAngle(wm.body, angle)
      }

      if (isHoleComplete) {
        // Freeze ball: kill velocity and snap to cup center
        Matter.Body.setVelocity(bl, { x: 0, y: 0 })
        Matter.Body.setPosition(bl, { x: h.hole.x, y: h.hole.y })
      } else {
        Matter.Engine.update(eng, 1000 / 60)
      }

      const pos = bl.position
      const vel = bl.velocity
      const spd = Math.sqrt(vel.x ** 2 + vel.y ** 2)

      // ── Force emitters ────────────────────────────────────────────────────
      if (!isHoleComplete && h.forceEmitters) {
        for (const fe of h.forceEmitters) {
          const ex = pos.x - fe.x
          const ey = pos.y - fe.y
          if (Math.sqrt(ex * ex + ey * ey) < fe.radius) {
            Matter.Body.applyForce(bl, bl.position, {
              x: Math.cos(fe.angle) * fe.strength,
              y: Math.sin(fe.angle) * fe.strength,
            })
          }
        }
      }

      // Trail — only accumulate while the ball is in flight
      if (!isHoleComplete) {
        trailRef.current.push({ x: pos.x, y: pos.y })
        if (trailRef.current.length > 18) trailRef.current.shift()
      }

      // Hole detection
      const dx   = pos.x - h.hole.x
      const dy   = pos.y - h.hole.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (!isHoleComplete && dist < HOLE_RADIUS && spd < SINK_SPEED) {
        playSfx('holeIn')
        completeHole()
        if (selectedCourseId) recordHoleResult(selectedCourseId, h.id, currentShots + 1)
      }

      // ── Confetti spawn (once, on first completion) ───────────────────────
      if (isHoleComplete && !confettiSpawnedRef.current) {
        confettiSpawnedRef.current = true
        spawnConfetti(confettiRef.current, h.hole.x, h.hole.y)
      }

      // ── Draw ─────────────────────────────────────────────────────────────
      drawBackground(ctx, theme, h.width, h.height, frame)
      drawFairway(ctx)

      for (const zone of h.terrain) {
        if (zone.type === 'fairway') continue
        ctx.fillStyle = zone.type === 'sand' ? '#d4a853' : '#3b82f6'
        ctx.fillRect(zone.x, zone.y, zone.w, zone.h)
      }

      if (h.forceEmitters) {
        for (const fe of h.forceEmitters) drawForceEmitter(ctx, fe, frame)
      }
      for (const wall of h.walls) drawWall(ctx, wall)
      for (const obs  of h.obstacles) drawObstacle(ctx, obs, frame)
      drawHole(ctx, h.hole)

      // ── Impact rings ──────────────────────────────────────────────────────
      const aliveRings: ImpactRing[] = []
      for (const ring of ringsRef.current) {
        ring.r    += (ring.maxR - ring.r) * 0.22 + 0.8
        ring.life -= 0.09
        if (ring.life <= 0) continue
        ctx.save()
        ctx.globalAlpha = ring.life * 0.75
        ctx.strokeStyle = ring.color
        ctx.lineWidth   = 2.5
        ctx.beginPath()
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
        aliveRings.push(ring)
      }
      ringsRef.current = aliveRings

      // ── Particles ─────────────────────────────────────────────────────────
      const alive: Particle[] = []
      for (const p of particlesRef.current) {
        p.x    += p.vx
        p.y    += p.vy
        p.vx   *= 0.86
        p.vy   *= 0.86
        p.life -= p.decay
        if (p.life <= 0) continue
        ctx.save()
        ctx.globalAlpha = p.life * p.life
        ctx.fillStyle   = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        alive.push(p)
      }
      particlesRef.current = alive

      // ── Confetti ──────────────────────────────────────────────────────────
      const aliveConfetti: ConfettiPiece[] = []
      for (const c of confettiRef.current) {
        c.x  += c.vx
        c.y  += c.vy
        c.vy += 0.09          // gravity pulls down
        c.vx *= 0.985         // gentle air resistance
        c.rotation += c.rotSpeed
        c.life -= c.decay
        if (c.life <= 0) continue
        ctx.save()
        ctx.globalAlpha = c.life < 0.3 ? c.life / 0.3 : 1  // fade only in last 30%
        ctx.translate(c.x, c.y)
        ctx.rotate(c.rotation)
        ctx.fillStyle = c.color
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h)
        ctx.restore()
        aliveConfetti.push(c)
      }
      confettiRef.current = aliveConfetti

      const ballItem = BALL_ITEMS[ballSkinId]
      const clubItem = CLUB_ITEMS[clubSkinId]

      // Decay hit-squash animation (~15 frames to fade out)
      const squash = hitSquashRef.current
      hitSquashRef.current = Math.max(0, squash * 0.72)

      // When complete, draw ball sitting in the cup; otherwise draw at physics pos
      const drawPos   = isHoleComplete ? h.hole : { x: pos.x, y: pos.y }
      const drawVel   = isHoleComplete ? { x: 0, y: 0 } : { x: vel.x, y: vel.y }
      const drawTrail = isHoleComplete ? [] : trailRef.current
      drawBall(ctx, drawPos, drawVel, isHoleComplete ? 0 : squash, shotAngleRef.current, ballItem.color, ballItem.trailColor ?? 'rgba(255,255,255,0.4)', drawTrail)

      if (!isHoleComplete) {
        const dragAngle = dragStart.current && dragCurrent.current
          ? Math.atan2(dragStart.current.y - dragCurrent.current.y, dragStart.current.x - dragCurrent.current.x)
          : Math.atan2(-1, 0)
        const dragDist = dragStart.current && dragCurrent.current
          ? Math.min(Math.sqrt((dragCurrent.current.x - dragStart.current.x) ** 2 + (dragCurrent.current.y - dragStart.current.y) ** 2) * DRAG_SCALE, MAX_POWER)
          : 0
        drawClub(ctx, { x: pos.x, y: pos.y }, dragAngle + Math.PI, dragDist, clubItem.color)
      }

      // HUD
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(10, 10, 90, 36)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 16px Fredoka One, cursive'
      ctx.fillText(`Shots: ${currentShots}`, 20, 32)

      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(h.width - 80, 10, 70, 36)
      ctx.fillStyle = '#fff'
      ctx.fillText(`Par ${h.par}`, h.width - 70, 32)

      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)
    rafRef.current = rafId

    return () => {
      cancelAnimationFrame(rafId)
      Matter.Engine.clear(engine)
      engineRef.current   = null
      ballBodyRef.current = null
      trailRef.current    = []
      particlesRef.current = []
      ringsRef.current      = []
      confettiRef.current   = []
    }
  }, [hole]) // ← only hole; state is read via live ref inside loop

  // ── Pointer events ────────────────────────────────────────────────────────

  function toCanvasPos(e: ReactPointerEvent<HTMLCanvasElement>): Vec2 {
    const rect   = canvasRef.current!.getBoundingClientRect()
    const scaleX = (hole?.width  ?? 700) / rect.width
    const scaleY = (hole?.height ?? 420) / rect.height
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (isHoleComplete) return
    const ball = ballBodyRef.current
    if (!ball) return
    const speed = Math.sqrt(ball.velocity.x ** 2 + ball.velocity.y ** 2)
    if (speed > 0.5) return   // wait for ball to stop
    dragStart.current   = toCanvasPos(e)
    dragCurrent.current = dragStart.current
    isDragging.current  = true
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDragging.current) return
    dragCurrent.current = toCanvasPos(e)
  }

  function onPointerUp(_e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDragging.current || !dragStart.current || !dragCurrent.current) return
    isDragging.current = false

    const ball = ballBodyRef.current
    if (!ball) return

    const dx      = dragStart.current.x - dragCurrent.current.x
    const dy      = dragStart.current.y - dragCurrent.current.y
    const rawDist = Math.sqrt(dx * dx + dy * dy)
    if (rawDist < 5) { dragStart.current = null; dragCurrent.current = null; return }

    const power = Math.min(rawDist * DRAG_SCALE, MAX_POWER)
    const nx    = dx / rawDist
    const ny    = dy / rawDist

    // Apply impulse — scale factor tuned so max power gives a good cross-hole shot
    Matter.Body.setVelocity(ball, { x: nx * power * 0.06, y: ny * power * 0.06 })
    trailRef.current = []
    // Kick off squash-on-hit animation
    hitSquashRef.current = 1.0
    shotAngleRef.current = Math.atan2(ny, nx)

    // ── Shot VFX: particles + optional ring, scaled by power ──────────────
    const powerRatio = power / MAX_POWER  // 0 – 1
    if (powerRatio > 0.08) {
      const count = Math.round(2 + powerRatio * 11)   // 2 at low → 13 at max
      // Colour shifts: soft green → amber → red-orange as power rises
      const colors = powerRatio > 0.72
        ? ['#ef4444', '#f97316', '#fbbf24', '#ffffff', '#fed7aa']
        : powerRatio > 0.42
        ? ['#fbbf24', '#fde68a', '#ffffff', '#86efac', '#f59e0b']
        : ['#86efac', '#4ade80', '#bbf7d0', '#ffffff']
      // Particles spray backward from ball (opposite to shot direction)
      const backAngle = Math.atan2(ny, nx) + Math.PI
      for (let i = 0; i < count; i++) {
        const spread = (Math.random() - 0.5) * Math.PI * 0.75   // ±67°
        const angle  = backAngle + spread
        const spd    = (1.5 + Math.random() * 2.5) * (0.4 + powerRatio * 0.6)
        particlesRef.current.push({
          x: ball.position.x, y: ball.position.y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 1,
          decay: 0.038 + Math.random() * 0.03,
          size: (2 + powerRatio * 3.5) * (0.6 + Math.random() * 0.8),
          color: colors[Math.floor(Math.random() * colors.length)],
        })
      }
      // Expanding ring — grows with power, only spawns above 35%
      if (powerRatio > 0.35) {
        ringsRef.current.push({
          x: ball.position.x, y: ball.position.y,
          r: BALL_RADIUS,
          maxR: BALL_RADIUS + 10 + powerRatio * 22,
          life: 1,
          color: powerRatio > 0.72 ? '#f97316' : powerRatio > 0.45 ? '#fbbf24' : '#86efac',
        })
      }
    }

    playSfx('shot')
    recordShot()

    dragStart.current   = null
    dragCurrent.current = null
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!hole) {
    return <div className="flex items-center justify-center h-full text-white">No hole loaded.</div>
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center" style={{ background: '#1a1a2e' }}>
      {/* Portrait canvas — fill height, constrain width */}
      <canvas
        ref={canvasRef}
        width={hole!.width}
        height={hole!.height}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          display: 'block',
          touchAction: 'none',
          cursor: 'crosshair',
          /* keep aspect ratio; on portrait phones this fills the screen height */
          objectFit: 'contain',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />

      {/* ── Back / Quit button ── always visible during play ── */}
      {!isHoleComplete && (
        <button
          onClick={() => useGameStore.getState().goToLevelSelect(selectedCourseId!)}
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 10,
            background: 'rgba(0,0,0,0.55)',
            border: '2px solid rgba(255,255,255,0.25)',
            borderRadius: 12,
            color: '#fff',
            fontSize: 20,
            lineHeight: 1,
            padding: '6px 10px',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}
          title="Quit hole"
        >
          X
        </button>
      )}

      {/* Hole-complete overlay — shown after 2 s confetti delay */}
      {overlayVisible && (
        <div className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
          <div className="text-6xl mb-2">{'⛳'}</div>
          <h2 className="text-4xl font-fredoka text-white mb-1">Hole Complete!</h2>
          <p className="text-xl font-nunito text-yellow-300 mb-6">
            {currentShots} shot{currentShots !== 1 ? 's' : ''} &middot; Par {hole!.par}
          </p>
          <button
            className="btn-3d px-8 py-3 text-xl font-fredoka"
            style={{ background: 'linear-gradient(160deg,#4c1d95,#3b0764)', border: '4px solid #a78bfa', borderBottom: '4px solid #2e1065', boxShadow: '0 6px 0 #1e0050', borderRadius: '18px', color: '#fff' }}
            onClick={() => useGameStore.getState().goToLevelSelect(selectedCourseId!)}
          >
            Continue
          </button>
        </div>
      )}
    </div>
  )
}
