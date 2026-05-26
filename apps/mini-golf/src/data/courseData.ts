// Course data — portrait canvas (380 × 640).
// Play area inside boundary walls: x 40-340, y 60-580  (300 × 520 px).
//
// Ball starts at the BOTTOM (near the player's thumb, y ≈ 530).
// Cup sits at the TOP (y ≈ 110-130). Shoot upward to reach the hole.

import type { Course } from '../types'

const W = 380
const H = 640

// Boundary walls reused in every hole.
const BORDER = [
  { x: 20,     y: 40,     w: W - 40, h: 20 }, // top
  { x: 20,     y: H - 60, w: W - 40, h: 20 }, // bottom
  { x: 20,     y: 40,     w: 20, h: H - 100 }, // left
  { x: W - 40, y: 40,     w: 20, h: H - 100 }, // right
]

export const COURSES: Course[] = [
  // ── Forest Links ──────────────────────────────────────────────────────────
  {
    id: 'forest',
    name: 'Forest Links',
    description: 'A peaceful round through the pines.',
    theme: 'forest',
    thumbnail: '\u{1F332}',
    isPremium: false,
    holes: [
      // Hole 1 — Straight shot (par 2)
      {
        id: 'forest_01',
        par: 2,
        width: W, height: H,
        ball: { x: W / 2, y: 530 },
        hole: { x: W / 2, y: 120 },
        walls: [...BORDER],
        obstacles: [],
        terrain: [],
      },

      // Hole 2 — Dogleg right (par 3)
      {
        id: 'forest_02',
        par: 3,
        width: W, height: H,
        ball: { x: 110, y: 530 },
        hole: { x: 270, y: 130 },
        walls: [
          ...BORDER,
          { x: 40, y: 320, w: 200, h: 20 },
        ],
        obstacles: [
          { type: 'box', x: 160, y: 430 },
          { type: 'box', x: 110, y: 390 },
        ],
        terrain: [
          { type: 'sand', x: 80, y: 370, w: 100, h: 100 },
        ],
      },

      // Hole 3 — Bumper alley (par 3)
      {
        id: 'forest_03',
        par: 3,
        width: W, height: H,
        ball: { x: W / 2, y: 530 },
        hole: { x: 110, y: 130 },
        walls: [
          ...BORDER,
          { x: 40, y: 360, w: 180, h: 20 },
        ],
        obstacles: [
          { type: 'bumper', x: 250, y: 270 },
          { type: 'bumper', x: 130, y: 200 },
        ],
        terrain: [
          { type: 'water', x: 40, y: 150, w: 100, h: 80 },
        ],
        forceEmitters: [
          { x: 210, y: 430, angle: Math.PI,      strength: 0.0008, radius: 55 },
          { x: 190, y: 300, angle: -Math.PI / 2, strength: 0.0007, radius: 48 },
        ],
      },

      // Hole 4 — S-bend (par 4)
      {
        id: 'forest_04',
        par: 4,
        width: W, height: H,
        ball: { x: 270, y: 530 },
        hole: { x: 110, y: 130 },
        walls: [
          ...BORDER,
          { x: 130, y: 240, w: 210, h: 20 },
          { x: 40,  y: 400, w: 210, h: 20 },
        ],
        obstacles: [
          { type: 'box',    x: 160, y: 475 },
          { type: 'bumper', x: 115, y: 330 },
        ],
        terrain: [
          { type: 'sand',  x: 200, y: 440, w: 100, h: 80 },
          { type: 'water', x: 60,  y: 160, w: 120, h: 80 },
        ],
      },

      // Hole 5 — Windmill gauntlet (par 3)
      {
        id: 'forest_05',
        par: 3,
        width: W, height: H,
        ball: { x: W / 2, y: 530 },
        hole: { x: W / 2, y: 130 },
        walls: [
          ...BORDER,
          { x: 180, y: 240, w: 160, h: 20 },
          { x: 40,  y: 400, w: 160, h: 20 },
        ],
        obstacles: [
          { type: 'windmill', x: W / 2, y: 320, speed: 1.2 },
        ],
        terrain: [],
      },

      // Hole 6 — Chicane (par 3)
      // Two offset walls force a left-right weave. Bumper guards the upper gap.
      {
        id: 'forest_06',
        par: 3,
        width: W, height: H,
        ball: { x: W / 2, y: 530 },
        hole: { x: W / 2, y: 130 },
        walls: [
          ...BORDER,
          { x: 40,  y: 430, w: 200, h: 20 }, // left wall — gap on right
          { x: 140, y: 280, w: 200, h: 20 }, // right wall — gap on left
        ],
        obstacles: [
          { type: 'bumper', x: 100, y: 360 },
        ],
        terrain: [
          { type: 'sand', x: 40, y: 340, w: 80, h: 80 },
        ],
      },

      // Hole 7 — Bumper Farm (par 3)
      // Open fairway packed with bumpers. Water strip along left edge.
      {
        id: 'forest_07',
        par: 3,
        width: W, height: H,
        ball: { x: 280, y: 530 },
        hole: { x: 100, y: 130 },
        walls: [...BORDER],
        obstacles: [
          { type: 'bumper', x: 190, y: 460 },
          { type: 'bumper', x: 110, y: 370 },
          { type: 'bumper', x: 260, y: 310 },
          { type: 'bumper', x: 150, y: 230 },
        ],
        terrain: [
          { type: 'water', x: 40, y: 160, w: 60, h: 200 },
        ],
      },

      // Hole 8 — Labyrinth (par 4)
      // Three walls create a Z-path. Box and water add difficulty.
      {
        id: 'forest_08',
        par: 4,
        width: W, height: H,
        ball: { x: 110, y: 530 },
        hole: { x: 270, y: 130 },
        walls: [
          ...BORDER,
          { x: 40,  y: 430, w: 210, h: 20 }, // left wall — gap right
          { x: 130, y: 300, w: 210, h: 20 }, // right wall — gap left
          { x: 40,  y: 180, w: 180, h: 20 }, // left wall — gap right
        ],
        obstacles: [
          { type: 'box', x: 290, y: 365 },
        ],
        terrain: [
          { type: 'sand',  x: 40,  y: 460, w: 100, h: 80 },
          { type: 'water', x: 220, y: 140, w: 120, h: 60 },
        ],
      },

      // Hole 9 — Jet Stream (par 3)
      // Two narrowing walls channel the ball. Force emitters give it a boost.
      {
        id: 'forest_09',
        par: 3,
        width: W, height: H,
        ball: { x: W / 2, y: 530 },
        hole: { x: W / 2, y: 130 },
        walls: [
          ...BORDER,
          { x: 40,  y: 390, w: 150, h: 20 }, // left — gap right
          { x: 190, y: 250, w: 150, h: 20 }, // right — gap left
        ],
        obstacles: [],
        terrain: [],
        forceEmitters: [
          { x: 280, y: 460, angle: -Math.PI / 2, strength: 0.0010, radius: 52 },
          { x: 100, y: 320, angle: -Math.PI / 2, strength: 0.0010, radius: 52 },
          { x: 280, y: 190, angle: -Math.PI / 2, strength: 0.0009, radius: 48 },
        ],
      },

      // Hole 10 — Grand Forest (par 5)
      // Boss hole: windmill, bumpers, walls, water, sand, force emitter.
      {
        id: 'forest_10',
        par: 5,
        width: W, height: H,
        ball: { x: 270, y: 530 },
        hole: { x: 110, y: 130 },
        walls: [
          ...BORDER,
          { x: 40,  y: 440, w: 180, h: 20 },
          { x: 160, y: 310, w: 180, h: 20 },
          { x: 40,  y: 190, w: 160, h: 20 },
        ],
        obstacles: [
          { type: 'windmill', x: W / 2, y: 375, speed: 1.5 },
          { type: 'bumper',   x: 290,   y: 250 },
          { type: 'bumper',   x: 90,    y: 250 },
          { type: 'box',      x: 220,   y: 490 },
        ],
        terrain: [
          { type: 'water', x: 40,  y: 140, w: 100, h: 70 },
          { type: 'sand',  x: 200, y: 460, w: 100, h: 80 },
        ],
        forceEmitters: [
          { x: 300, y: 375, angle: Math.PI, strength: 0.0008, radius: 50 },
        ],
      },
    ],
  },

  // ── Ocean Breeze ──────────────────────────────────────────────────────────
  {
    id: 'ocean',
    name: 'Ocean Breeze',
    description: 'Coastal cliffs and sea air.',
    theme: 'ocean',
    thumbnail: '\u{1F30A}',
    isPremium: false,
    holes: [
      // Ocean 1 — Island green (par 2)
      {
        id: 'ocean_01',
        par: 2,
        width: W, height: H,
        ball: { x: W / 2, y: 530 },
        hole: { x: W / 2, y: 130 },
        walls: [...BORDER],
        obstacles: [],
        terrain: [
          { type: 'water', x: 110, y: 280, w: 160, h: 80 },
        ],
        forceEmitters: [
          { x: 300, y: 340, angle: -Math.PI / 2, strength: 0.0009, radius: 52 },
          { x: 70,  y: 340, angle: -Math.PI / 2, strength: 0.0009, radius: 52 },
        ],
      },

      // Ocean 2 — Diagonal crossing (par 3)
      {
        id: 'ocean_02',
        par: 3,
        width: W, height: H,
        ball: { x: 270, y: 530 },
        hole: { x: 110, y: 130 },
        walls: [
          ...BORDER,
          { x: 40, y: 380, w: 200, h: 20 },
        ],
        obstacles: [
          { type: 'bumper', x: 200, y: 260 },
        ],
        terrain: [
          { type: 'water', x: 260, y: 360, w: 80, h: 120 },
          { type: 'water', x: 40,  y: 160, w: 80, h: 100 },
        ],
      },

      // Ocean 3 — Coral Pass (par 3)
      // Two bumper "coral" columns flank the fairway. Water guards the top corners.
      {
        id: 'ocean_03',
        par: 3,
        width: W, height: H,
        ball: { x: W / 2, y: 530 },
        hole: { x: W / 2, y: 130 },
        walls: [
          ...BORDER,
          { x: 40, y: 360, w: 130, h: 20 }, // left blocker
          { x: 210, y: 360, w: 130, h: 20 }, // right blocker — gap in middle
        ],
        obstacles: [
          { type: 'bumper', x: 110, y: 240 },
          { type: 'bumper', x: 270, y: 240 },
        ],
        terrain: [
          { type: 'water', x: 40,  y: 150, w: 80,  h: 80 },
          { type: 'water', x: 260, y: 150, w: 80,  h: 80 },
        ],
      },

      // Ocean 4 — Whirlpool (par 3)
      // No walls. Three sweeping force emitters simulate a current.
      {
        id: 'ocean_04',
        par: 3,
        width: W, height: H,
        ball: { x: 270, y: 530 },
        hole: { x: 110, y: 130 },
        walls: [...BORDER],
        obstacles: [],
        terrain: [
          { type: 'water', x: 130, y: 310, w: 120, h: 80 },
        ],
        forceEmitters: [
          { x: 300, y: 460, angle: -Math.PI / 2, strength: 0.0009, radius: 55 },
          { x: 300, y: 260, angle: Math.PI,       strength: 0.0009, radius: 55 },
          { x: 80,  y: 200, angle: -Math.PI / 2,  strength: 0.0009, radius: 55 },
        ],
      },

      // Ocean 5 — Archipelago (par 4)
      // Three water patches — navigate the green islands between them.
      {
        id: 'ocean_05',
        par: 4,
        width: W, height: H,
        ball: { x: W / 2, y: 530 },
        hole: { x: 270, y: 130 },
        walls: [
          ...BORDER,
          { x: 40, y: 320, w: 160, h: 20 },
        ],
        obstacles: [
          { type: 'bumper', x: 270, y: 260 },
        ],
        terrain: [
          { type: 'water', x: 40,  y: 420, w: 120, h: 80 },
          { type: 'water', x: 200, y: 300, w: 140, h: 70 },
          { type: 'water', x: 40,  y: 150, w: 100, h: 80 },
        ],
      },

      // Ocean 6 — The Channel (par 3)
      // Narrow walls create a tight corridor. Emitter pushes you through.
      {
        id: 'ocean_06',
        par: 3,
        width: W, height: H,
        ball: { x: W / 2, y: 530 },
        hole: { x: W / 2, y: 130 },
        walls: [
          ...BORDER,
          { x: 40,  y: 60, w: 130, h: 340 }, // solid left wall leaving narrow right channel
          { x: 210, y: 240, w: 130, h: 340 }, // solid right wall leaving narrow left channel
        ],
        obstacles: [],
        terrain: [],
        forceEmitters: [
          { x: 290, y: 400, angle: -Math.PI / 2, strength: 0.0011, radius: 55 },
          { x: 90,  y: 200, angle: -Math.PI / 2, strength: 0.0011, radius: 55 },
        ],
      },

      // Ocean 7 — Bermuda (par 4)
      // Ball bottom-right, cup top-left. Central water + 3 bumpers.
      {
        id: 'ocean_07',
        par: 4,
        width: W, height: H,
        ball: { x: 280, y: 530 },
        hole: { x: 100, y: 130 },
        walls: [
          ...BORDER,
          { x: 40,  y: 390, w: 160, h: 20 },
          { x: 180, y: 250, w: 160, h: 20 },
        ],
        obstacles: [
          { type: 'bumper', x: 240, y: 320 },
          { type: 'bumper', x: 130, y: 320 },
          { type: 'bumper', x: 185, y: 430 },
        ],
        terrain: [
          { type: 'water', x: 110, y: 280, w: 160, h: 100 },
        ],
      },

      // Ocean 8 — Tidal Shelf (par 3)
      // Large sand zone slows the ball. Two bumpers deflect toward the cup.
      {
        id: 'ocean_08',
        par: 3,
        width: W, height: H,
        ball: { x: 120, y: 530 },
        hole: { x: 270, y: 130 },
        walls: [
          ...BORDER,
          { x: 140, y: 360, w: 200, h: 20 },
        ],
        obstacles: [
          { type: 'bumper', x: 100, y: 280 },
          { type: 'bumper', x: 220, y: 220 },
        ],
        terrain: [
          { type: 'sand', x: 40, y: 380, w: 300, h: 140 },
          { type: 'water', x: 260, y: 380, w: 80, h: 140 },
        ],
      },

      // Ocean 9 — Shoals (par 4)
      // Alternating water hazards on left/right. Two walls + bumper.
      {
        id: 'ocean_09',
        par: 4,
        width: W, height: H,
        ball: { x: 110, y: 530 },
        hole: { x: 270, y: 130 },
        walls: [
          ...BORDER,
          { x: 40,  y: 410, w: 200, h: 20 },
          { x: 140, y: 260, w: 200, h: 20 },
        ],
        obstacles: [
          { type: 'bumper', x: 190, y: 335 },
        ],
        terrain: [
          { type: 'water', x: 40,  y: 440, w: 90, h: 120 },
          { type: 'water', x: 250, y: 160, w: 90, h: 120 },
        ],
      },

      // Ocean 10 — Squall (par 4)
      // Sideways force emitters push ball off course — adapt your aim.
      {
        id: 'ocean_10',
        par: 4,
        width: W, height: H,
        ball: { x: W / 2, y: 530 },
        hole: { x: 120, y: 130 },
        walls: [
          ...BORDER,
          { x: 160, y: 320, w: 180, h: 20 },
        ],
        obstacles: [
          { type: 'bumper', x: 270, y: 420 },
        ],
        terrain: [
          { type: 'water', x: 40, y: 400, w: 80, h: 120 },
        ],
        forceEmitters: [
          { x: 220, y: 470, angle: Math.PI,      strength: 0.0009, radius: 55 }, // push left
          { x: 100, y: 240, angle: 0,             strength: 0.0008, radius: 50 }, // push right (tricky!)
        ],
      },

      // Ocean 11 — Deep Trench (par 4)
      // Three staggered walls + water flanking the cup.
      {
        id: 'ocean_11',
        par: 4,
        width: W, height: H,
        ball: { x: 270, y: 530 },
        hole: { x: 110, y: 130 },
        walls: [
          ...BORDER,
          { x: 40,  y: 430, w: 200, h: 20 },
          { x: 140, y: 300, w: 200, h: 20 },
          { x: 40,  y: 180, w: 190, h: 20 },
        ],
        obstacles: [
          { type: 'box', x: 290, y: 365 },
        ],
        terrain: [
          { type: 'water', x: 220, y: 140, w: 120, h: 60 },
          { type: 'water', x: 40,  y: 450, w: 80,  h: 80 },
        ],
      },

      // Ocean 12 — Tempest (par 5)
      // Three walls + two bumpers + water + a disruptive force emitter.
      {
        id: 'ocean_12',
        par: 5,
        width: W, height: H,
        ball: { x: W / 2, y: 530 },
        hole: { x: W / 2, y: 130 },
        walls: [
          ...BORDER,
          { x: 40,  y: 430, w: 170, h: 20 },
          { x: 170, y: 300, w: 170, h: 20 },
          { x: 40,  y: 180, w: 170, h: 20 },
        ],
        obstacles: [
          { type: 'bumper', x: 300, y: 365 },
          { type: 'bumper', x: 80,  y: 240 },
        ],
        terrain: [
          { type: 'water', x: 40,  y: 450, w: 100, h: 80 },
          { type: 'water', x: 240, y: 140, w: 100, h: 80 },
        ],
        forceEmitters: [
          { x: 300, y: 490, angle: -Math.PI / 2, strength: 0.0009, radius: 52 },
          { x: 80,  y: 365, angle: Math.PI / 2,  strength: 0.0007, radius: 46 }, // pushes down — disruptive!
        ],
      },

      // Ocean 13 — The Abyss (par 5)
      // Grand finale: walls, windmill, bumpers, box, water, sand, force emitters.
      {
        id: 'ocean_13',
        par: 5,
        width: W, height: H,
        ball: { x: 110, y: 530 },
        hole: { x: 270, y: 130 },
        walls: [
          ...BORDER,
          { x: 40,  y: 440, w: 190, h: 20 },
          { x: 150, y: 310, w: 190, h: 20 },
          { x: 40,  y: 190, w: 190, h: 20 },
        ],
        obstacles: [
          { type: 'windmill', x: W / 2, y: 375, speed: 1.8 },
          { type: 'bumper',   x: 300,   y: 250 },
          { type: 'bumper',   x: 80,    y: 250 },
          { type: 'box',      x: 100,   y: 490 },
        ],
        terrain: [
          { type: 'water', x: 230, y: 450, w: 110, h: 80 },
          { type: 'water', x: 40,  y: 140, w: 100, h: 70 },
          { type: 'sand',  x: 40,  y: 340, w: 80,  h: 90 },
        ],
        forceEmitters: [
          { x: 300, y: 490, angle: -Math.PI / 2, strength: 0.0010, radius: 52 },
          { x: 80,  y: 375, angle: Math.PI,       strength: 0.0008, radius: 48 },
        ],
      },
    ],
  },

  // ── Space Station ──────────────────────────────────────────────────────────
  {
    id: 'space',
    name: 'Space Station',
    description: 'Zero-gravity golf. Almost.',
    theme: 'space',
    thumbnail: '\u{1F680}',
    isPremium: true,
    holes: [
      // Space 1 — Slalom gates (par 3)
      {
        id: 'space_01',
        par: 3,
        width: W, height: H,
        ball: { x: W / 2, y: 530 },
        hole: { x: W / 2, y: 130 },
        walls: [
          ...BORDER,
          { x: 40,  y: 170, w: 140, h: 20 },
          { x: 160, y: 280, w: 180, h: 20 },
          { x: 40,  y: 410, w: 180, h: 20 },
        ],
        obstacles: [
          { type: 'bumper', x: 100, y: 240 },
          { type: 'bumper', x: 290, y: 370 },
        ],
        terrain: [],
        forceEmitters: [
          { x: 280, y: 460, angle: -Math.PI / 2, strength: 0.0010, radius: 50 },
          { x: 90,  y: 330, angle: -Math.PI / 2, strength: 0.0010, radius: 50 },
          { x: 280, y: 210, angle: Math.PI,       strength: 0.0008, radius: 44 },
        ],
      },
    ],
  },
]

/** Flat lookup by course id. */
export const COURSE_MAP = new Map<string, Course>(COURSES.map(c => [c.id, c]))
