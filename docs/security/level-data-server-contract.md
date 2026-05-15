# Server-Authoritative Level Data — API Contract

**Status:** draft for review
**Goal:** remove all answer keys (`words`, `bonus`, `defs`) from the client bundle. Server becomes the only thing that knows what words are valid for a level.

---

## 1. Threat model recap

Today, anyone can:

1. Open the JS bundle and read `LEVELS[i].words` for every level.
2. Open React DevTools and read `useGameStore.getState().levels[i].words`.
3. Call `useProgressStore.getState().markLevelComplete(...)` to skip levels.
4. Edit `wc_economy_v1` in localStorage to grant gems/hints.

This milestone closes (1) and (2). It also closes (3) and (4) as a side effect for level-complete and hint-spend, because completion and hint-spend become server-issued — but the localStorage edits for *other* gem grants (world rewards, shop purchases) still need their own fix in a later milestone.

---

## 2. Data split: public vs private

### Public (safe to ship in bundle)

| Field | Notes |
|---|---|
| `levelId` | Stable opaque id, e.g. `townstar-0`. Never reveals theme. |
| `worldId` | Already public. |
| `difficulty` | Already public. |
| `slotCount` | How many required-word slots. |
| `slotLengths` | Sorted array, e.g. `[3,3,3,5]`. Needed to render the WordGrid skeleton. |
| `bonusSlotCount` | Just a count (so UI can show "X bonus tokens"). No lengths. |
| `letterCount` | Number of letters on the wheel. |

### Private (server only)

| Field | Why private |
|---|---|
| `words` | The answer key. |
| `bonus` | Secondary answer key — still valuable to a cheater. |
| `defs` | Reveals the theme of each word. |
| `theme` | Often literally the longest answer (e.g. `'VAULT'`). **Must move server-side.** Client gets a display string only after the level is cleared (or a deliberately scrambled title like "Level 3"). |
| `letters` (the wheel) | These are the answer's letters. Client gets them, but the **server returns them in a session-randomized order** keyed to the round, so the order itself doesn't leak the word. |

### Side note: wheel letter ordering

The wheel letters have to be on the client (the player drags through them), but today they're returned in answer-order. Server should randomize them per-round. The randomization is fine to be predictable to the server only — client just receives a shuffled array.

---

## 3. Endpoints

All endpoints under `/api/play/...`. All require `Authorization: Bearer <jwt>` (already wired in `apiClient.ts`).

### `POST /api/play/level/start`

Begin a round. Server creates a server-side **round** (DB row) and returns the public manifest.

**Request**
```json
{
  "worldId": "townstar",
  "levelIndex": 0,
  "mode": "single"   // or "daily"
}
```

**Response**
```json
{
  "roundId": "r_01HXYZ...",          // opaque, client passes it back on every action
  "manifest": {
    "levelId": "townstar-0",
    "worldId": "townstar",
    "difficulty": 4.05,
    "letters": ["L","T","A","V","U"], // shuffled per round
    "slotCount": 4,
    "slotLengths": [3, 3, 3, 5],
    "bonusSlotCount": 0,
    "displayTitle": "Level 1"        // never reveals theme word
  },
  "serverTime": 1715800000000        // for the client clock; do not trust client-local time
}
```

### `POST /api/play/level/submit-word`

Validate a word attempt.

**Request**
```json
{
  "roundId": "r_01HXYZ...",
  "word": "VAULT"
}
```

**Response (accepted, primary)**
```json
{
  "result": "accepted",
  "kind": "primary",          // or "bonus"
  "scoreDelta": 50,
  "totalScore": 50,
  "filled": { "len": 5, "ordinal": 0 },   // which slot got filled, by length+order
  "def": "In DeFi, a vault is..."         // ok to send AFTER the word is found
}
```

**Response (rejected)**
```json
{ "result": "rejected", "reason": "not-in-chain", "missCount": 1 }
```

**Response (duplicate)**
```json
{ "result": "duplicate" }
```

Server keeps the canonical list of found words. The client only knows which slots are filled — never what's in unfilled slots.

### `POST /api/play/level/hint`

Spend one hint, reveal one letter of one unfilled slot.

**Request**
```json
{ "roundId": "r_01HXYZ..." }
```

**Response**
```json
{
  "slot":     { "len": 5, "ordinal": 0 },   // which slot
  "position": 2,                            // 0-based letter index within the slot
  "letter":   "U",                          // the actual letter
  "hintsRemaining": 2                       // server balance after spend
}
```

If the player has no hints, returns `402 Payment Required` with `{ "reason": "no-hints" }` and the client shows the shop.

### `POST /api/play/level/complete`

Optional — server can also detect completion implicitly on the last `submit-word`. If used, returns the final breakdown.

**Response**
```json
{
  "breakdown": {
    "base": 50, "missesPenalty": 0, "hintsPenalty": 0,
    "timeBonus": 12, "final": 62
  },
  "gemsAwarded": 0,                          // world-completion bounty handled separately
  "newGemsBalance": 245,
  "newHintsBalance": 2
}
```

The server is the only authority for `breakdown.final`. Client-computed `computeScoreBreakdown(...)` becomes a *display preview* only.

---

## 4. Client-side changes

### `src/types.ts`

`Level` becomes the public manifest only:

```ts
export interface LevelManifest {
  levelId: string
  worldId: string
  difficulty: number
  letters: string[]
  slotCount: number
  slotLengths: number[]
  bonusSlotCount: number
  displayTitle: string
}
```

A second type for runtime per-slot state:

```ts
export interface SlotState {
  len: number
  ordinal: number          // which slot of this length (server-assigned)
  filled?: { word: string; def: string }   // only set after submit accepted
  hinted: Array<{ position: number; letter: string }>   // server-revealed
}
```

### `src/store/gameStore.ts`

- `loadLevels` / `loadWorldLevels` → keep, but they only carry public manifests.
- `initLevel` → calls `POST /api/play/level/start`, stores `roundId` and manifest.
- `submitWord` → calls `POST /api/play/level/submit-word`, mutates state from the response. No more `lvl.words.includes(word)`.
- `useHint` → calls `POST /api/play/level/hint`, applies revealed letter to the right slot.
- Completion detection moves from `lvl.words.every(...)` to a `completed: true` flag in the submit-word response.
- `lastBreakdown` comes from server, not from `computeScoreBreakdown`. Local function stays for the daily-attempt-not-signed-in fallback (optional — could just require sign-in).

### `src/components/WordGrid.tsx`

Today renders rows by `level.words` and splits each word. Becomes:

```tsx
slots.map(s => (
  <WordRow key={`${s.len}-${s.ordinal}`} len={s.len}
    filledWord={s.filled?.word}
    hinted={s.hinted} />
))
```

When a slot isn't filled, render `len` blank tiles, plus any server-revealed hint letters at their positions. The full answer never enters client state.

### `src/data/*Levels.ts`

Move all `words`, `bonus`, `defs`, `theme` content to a server-only repository (e.g. a separate `server/data/levels/` tree, or a DB). The bundle keeps only `slotCount`, `slotLengths`, `difficulty`, `letterCount` per level — or arguably nothing at all (server can deliver the whole manifest at level-start time, eliminating the bundle file entirely).

**Recommendation:** drop the per-level bundle files entirely. The world list (`worldData.ts`) still ships with public metadata (name, icon, level count). The server is the only thing that knows what each level *is*.

---

## 5. Migration path (suggested order)

1. **Backend:** stand up `/api/play/level/start`, `/api/play/level/submit-word`, `/api/play/level/hint` using a server-side copy of the current level data. Persist rounds in a `play_rounds` table keyed by `(player_id, world_id, level_index, started_at)`.
2. **Client behind a flag:** add `VITE_SERVER_AUTHORITATIVE=true`. When on, gameStore calls the new endpoints; when off, current local logic runs. Lets you ship and roll back.
3. **Refactor WordGrid + slot model** so the client can render from `SlotState` rather than from `Level.words`.
4. **Cut over** in staging, smoke-test, ship to prod with the flag on.
5. **Delete** `words`/`bonus`/`defs`/`theme` from the client `data/*Levels.ts` files, ideally moving the whole files to the server. Grep the prod bundle for known answer words (`VAULT`, `CHAIN`, etc.) — must return zero hits.

---

## 6. What this does NOT fix yet

- Gem balance editing in localStorage (still possible for non-game grants — world rewards, shop credits).
- Premium world unlock flags in localStorage.
- Leaderboard score POST signing.

Those are the next milestones. After this one, **the largest exploits — answer extraction, free hints, fake level completion — are closed.**
