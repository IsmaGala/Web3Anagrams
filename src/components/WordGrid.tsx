import { useGameStore, selectCurrentLevel } from '../store/gameStore'
import type { SlotState } from '../types'

export default function WordGrid() {
  const round       = useGameStore(s => s.round)
  const level       = useGameStore(selectCurrentLevel)
  const foundWords  = useGameStore(s => s.foundWords)
  const hintedSlots = useGameStore(s => s.hintedSlots)

  // ── Server-authoritative path ──────────────────────────────────────────────
  // Render directly from the round's `slots` array. Each SlotState carries
  // its own length, fill state, and any hint reveals — the client never sees
  // the canonical answer until the slot is filled. Slots are grouped by
  // length (ascending) to match the legacy visual.
  if (round) {
    const grouped: Record<number, SlotState[]> = {}
    for (const s of round.slots) {
      if (!grouped[s.len]) grouped[s.len] = []
      grouped[s.len].push(s)
    }
    return (
      <div className="w-full max-w-sm px-4 mb-3">
        <div className="rounded-2xl p-3"
          style={{ background:'rgba(0,0,0,0.3)', border:'3px solid rgba(255,255,255,0.08)',
            boxShadow:'0 6px 0 rgba(0,0,0,0.4), inset 0 2px 0 rgba(255,255,255,0.05)', minHeight:72 }}>
          {Object.keys(grouped)
            .sort((a, b) => Number(a) - Number(b))
            .map(lenKey => grouped[Number(lenKey)]
              .sort((a, b) => a.ordinal - b.ordinal)
              .map(slot => (
                <SlotRow key={`${slot.len}-${slot.ordinal}`} slot={slot} />
              )))}
        </div>
      </div>
    )
  }

  // ── Legacy path ────────────────────────────────────────────────────────────
  if (!level) return null

  const groups: Record<number, string[]> = {}
  level.words.forEach(w => {
    if (!groups[w.length]) groups[w.length] = []
    groups[w.length].push(w)
  })

  return (
    <div className="w-full max-w-sm px-4 mb-3">
      <div className="rounded-2xl p-3"
        style={{ background:'rgba(0,0,0,0.3)', border:'3px solid rgba(255,255,255,0.08)',
          boxShadow:'0 6px 0 rgba(0,0,0,0.4), inset 0 2px 0 rgba(255,255,255,0.05)', minHeight:72 }}>
        {Object.keys(groups)
          .sort((a,b) => Number(a) - Number(b))
          .map(len => groups[Number(len)].map(word => (
            <WordRow key={word} word={word}
              found={foundWords.has(word)}
              hinted={hintedSlots[word] ?? []} />
          )))}
      </div>
    </div>
  )
}

function WordRow({ word, found, hinted }: { word: string; found: boolean; hinted: number[] }) {
  return (
    <div className="flex gap-1.5 mb-2 justify-center">
      {word.split('').map((ch, i) => {
        const isHinted = !found && hinted.includes(i)
        return (
          <div key={i} className={`letter-slot ${found ? 'filled' : ''} ${isHinted ? 'hinted' : ''}`}>
            {found ? ch : isHinted ? ch : ''}
          </div>
        )
      })}
    </div>
  )
}

/** Server-mode renderer. The full word is only known once the slot is
 *  filled; before that we render `slot.len` blank tiles with any server-
 *  revealed hint letters placed at their reported positions. */
function SlotRow({ slot }: { slot: SlotState }) {
  const filled = !!slot.filled
  // Build a position → letter lookup for hint reveals so render is O(len).
  const hintAt: Record<number, string> = {}
  for (const h of slot.hinted) hintAt[h.position] = h.letter

  return (
    <div className="flex gap-1.5 mb-2 justify-center">
      {Array.from({ length: slot.len }, (_, i) => {
        const filledCh = filled ? slot.filled!.word[i] : ''
        const hintedCh = hintAt[i]
        const isHinted = !filled && hintedCh !== undefined
        return (
          <div key={i} className={`letter-slot ${filled ? 'filled' : ''} ${isHinted ? 'hinted' : ''}`}>
            {filled ? filledCh : (isHinted ? hintedCh : '')}
          </div>
        )
      })}
    </div>
  )
}
