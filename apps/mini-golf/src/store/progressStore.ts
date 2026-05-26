import { create } from 'zustand'

const STORAGE_KEY = 'mg_progress_v1'

interface HoleProgress {
  completed:  boolean
  bestStrokes: number   // lowest stroke count achieved
}

interface CourseProgress {
  holes: Record<string, HoleProgress>
}

interface ProgressState {
  courses:       Record<string, CourseProgress>
  premiumCourses: string[]   // unlocked course ids

  // Actions
  recordHoleResult: (courseId: string, holeId: string, strokes: number) => void
  isCourseUnlocked: (courseId: string) => boolean
  unlockCourse:     (courseId: string) => void
  lockCourse:       (courseId: string) => void
  lockedOverrides:   string[]
  getBestStrokes:   (courseId: string, holeId: string) => number | null
  isHoleComplete:   (courseId: string, holeId: string) => boolean
  reset:            () => void
}

function load(): Pick<ProgressState, 'courses' | 'premiumCourses'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { courses: {}, premiumCourses: [] }
    return JSON.parse(raw)
  } catch { return { courses: {}, premiumCourses: [] } }
}

function save(state: Pick<ProgressState, 'courses' | 'premiumCourses'>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

const initial = load()

export const useProgressStore = create<ProgressState>((set, get) => ({
  ...initial,
  lockedOverrides: [],

  recordHoleResult: (courseId, holeId, strokes) => {
    const prev = get().courses[courseId]?.holes[holeId]
    const best = prev ? Math.min(prev.bestStrokes, strokes) : strokes
    set(s => {
      const courses = {
        ...s.courses,
        [courseId]: {
          holes: {
            ...(s.courses[courseId]?.holes ?? {}),
            [holeId]: { completed: true, bestStrokes: best },
          },
        },
      }
      save({ courses, premiumCourses: s.premiumCourses })
      return { courses }
    })
  },

  isCourseUnlocked: (courseId) => {
    if (get().lockedOverrides.includes(courseId)) return false
    return courseId === 'forest' || courseId === 'ocean' || get().premiumCourses.includes(courseId)
  },

  unlockCourse: (courseId) => {
    set(s => {
      const premiumCourses = s.premiumCourses.includes(courseId)
        ? s.premiumCourses
        : [...s.premiumCourses, courseId]
      const lockedOverrides = s.lockedOverrides.filter(id => id !== courseId)
      save({ courses: s.courses, premiumCourses })
      return { premiumCourses, lockedOverrides }
    })
  },

  lockCourse: (courseId) => {
    set(s => {
      const lockedOverrides = s.lockedOverrides.includes(courseId)
        ? s.lockedOverrides
        : [...s.lockedOverrides, courseId]
      const premiumCourses = s.premiumCourses.filter(id => id !== courseId)
      save({ courses: s.courses, premiumCourses })
      return { lockedOverrides, premiumCourses }
    })
  },

  getBestStrokes: (courseId, holeId) =>
    get().courses[courseId]?.holes[holeId]?.bestStrokes ?? null,

  isHoleComplete: (courseId, holeId) =>
    get().courses[courseId]?.holes[holeId]?.completed ?? false,

  reset: () => {
    save({ courses: {}, premiumCourses: [] })
    set({ courses: {}, premiumCourses: [], lockedOverrides: [] })
  },
}))
