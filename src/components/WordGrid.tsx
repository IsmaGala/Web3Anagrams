import { useGameStore, selectCurrentLevel } from '../store/gameStore'

export default function WordGrid() {
  const level       = useGameStore(selectCurrentLevel)
  const foundWords  = useGameStore(s => s.foundWords)
  const hintedSlots = useGameStore(s => s.hintedSlots)

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
