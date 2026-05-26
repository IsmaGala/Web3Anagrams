# NFT WordChain — Testnet Final Checklist

**Purpose:** Manual verification that every player-data element is correctly
tied to the wallet and survives wallet disconnect / reconnect across devices.

**Reference date:** 2026-05-26  
**Code changes included:** `profileSync.ts`, `progressStore.ts` (inventory
reconciliation + audio sync — see PR diff for detail).

---

## Pre-flight

Before running any test scenario, confirm these are set in Vercel
(Project Settings → Environment Variables):

- [ ] `DATABASE_URL` — Neon Postgres connection string (testnet DB)
- [ ] `JWT_SECRET` — at least 32 random bytes (`openssl rand -base64 48`)
- [ ] `JWT_TTL_SECONDS` — `86400` or desired lifetime
- [ ] `/api/health` returns `{ ok: true }` — confirms DB is reachable

---

## Test matrix

Each scenario is a session. "Device A" and "Device B" can be two browsers
(Chrome + Firefox), two incognito windows, or two physical devices.

---

### 1 · Hints

| Step | Action | Expected |
|---|---|---|
| 1a | Connect wallet on Device A | Welcome bonus grants 3 hints (or configured amount). Check toast fires once. |
| 1b | Open Shop → buy a hint pack (spend Gems) | Hint count increases immediately. |
| 1c | Disconnect → reconnect same wallet | Hint count matches what was on server, **not** what was in localStorage before reconnect. |
| 1d | Connect same wallet on Device B | Hint count matches Device A. |
| 1e | Disconnect on Device B, clear localStorage manually in DevTools, reconnect | Hint count is restored from server — localStorage wipe does not lose hints. |

**Failure mode to watch:** hint count reverts to default (3) on Device B →
`resp.balances` not being applied, or `player_balances` row missing.

---

### 2 · Gems

| Step | Action | Expected |
|---|---|---|
| 2a | Complete a level that grants Gem reward | Toast fires, Gem count increases. |
| 2b | Complete a world (all levels) — one-time bounty | Gem bounty fires **once**. Reconnect same wallet — no second grant. |
| 2c | Connect on Device B | Gem count matches. |
| 2d | Open DevTools → manually set `localStorage['wc_economy_v1']` to a huge number → refresh | After pull, Gem count is server value, not the tampered value. |

**Failure mode to watch:** inflated Gem balance persists →
`resp.balances` not overriding JSONB merge.

---

### 3 · Skins available (owned)

| Step | Action | Expected |
|---|---|---|
| 3a | Buy a non-default skin from Wardrobe (costs Gems) | Skin appears as owned in the Wardrobe picker. |
| 3b | Disconnect → reconnect | Skin still owned (JSONB payload sync). |
| 3c | Connect on Device B — skin should show as owned **even if Device A push failed** | Skin is present — confirmed by `inventory.ownedSkins` from `balance_transactions`, applied via `reconcileInventory`. |
| 3d | Win rank #1 in a weekly event | 1st-place skin is granted. Reconnect — skin is still owned on any device. |

**Failure mode to watch:** skin disappears on new device →
`inventory.ownedSkins` not being applied (was the bug we fixed in this PR).

---

### 4 · Wardrobe preference (equipped skin)

| Step | Action | Expected |
|---|---|---|
| 4a | Equip a non-default owned skin | Wheel renders with that skin. |
| 4b | Disconnect → reconnect | Same skin is equipped. |
| 4c | Change equipped skin on Device B | Device B shows new skin. Reconnect Device A — Device A keeps its own last-equipped skin (local preference wins on pull). |

**Failure mode to watch:** equipped skin resets to default →
`cosmetics.wheelSkin` not in JSONB payload, or merge logic wrong.

---

### 5 · Premium worlds unlocked

| Step | Action | Expected |
|---|---|---|
| 5a | Unlock a premium world (Asimov / Nature, costs Gems) | World is accessible on Device A. |
| 5b | Connect Device B — premium world should be accessible | Confirmed via `inventory.unlockedPremium` → `reconcileInventory`. |
| 5c | Disconnect Device A, clear localStorage, reconnect | Premium world still unlocked (restored from server inventory). |

**Failure mode to watch:** premium world locked again after localStorage clear →
`inventory.unlockedPremium` not applied (was the bug we fixed).

---

### 6 · Events (unlocked + rewards claimed)

| Step | Action | Expected |
|---|---|---|
| 6a | Enter a weekly event (pay Gems) | Event world accessible this week. |
| 6b | Reconnect same wallet on Device B | Event entry shows as unlocked for this week — no need to pay again. |
| 6c | Score points in the event | Points submit to leaderboard. Check `/api/leaderboard/[event]` returns your address. |
| 6d | At week end, claim rank reward | Toast fires, Gems/hints credited. `isEventRewardClaimedThisWeek` returns true. |
| 6e | Reconnect after claiming | Reward cannot be claimed again — pending-claim card gone. |
| 6f | Enter event in week N. Don't claim. New week starts. Enter week N+1. | Both week N (pending claim) and week N+1 (active) show correctly — stacking works. |

**Failure mode to watch:** event entry lost on Device B →
`inventory.eventUnlocks` not applied. Reward double-claimable →
event `claimed` flag not in JSONB payload merge.

---

### 7 · Single-player progress

| Step | Action | Expected |
|---|---|---|
| 7a | Complete 5 levels in a world | Progress persists after page reload (localStorage). |
| 7b | Disconnect → reconnect | Progress intact. |
| 7c | Disconnect Device A. Complete 3 more levels on Device B (different 3). Reconnect Device A. | Device A now shows the union of both sessions — all 8 levels marked complete; score is MAX per level. |
| 7d | Same level completed on both devices with different scores | Higher score wins on both after pull. |

**Failure mode to watch:** progress reset on reconnect →
JSONB merge not being called, or `mergeWorlds` producing empty output.

---

### 8 · Daily challenge timer

| Step | Action | Expected |
|---|---|---|
| 8a | Attempt the daily (win or lose) | Status locked for today — no second attempt. |
| 8b | Reconnect same wallet | Status still locked — `dailyAttempt.dateKey` matches today. |
| 8c | Lose daily on Device A. Reconnect on Device B (which has no local attempt). | Device B correctly shows today's daily as already attempted. |
| 8d | Win on Device A, lose on Device B (different sessions, same day). Reconnect either device. | Final status is **won** (win always beats loss on same dateKey in merge). |
| 8e | Next calendar day | Daily unlocks automatically — dateKey is stale. |

**Failure mode to watch:** daily can be re-attempted after reconnect →
`dailyAttempt` not in JSONB payload or dateKey comparison failing.

---

### 9 · Audio preference (SFX mute)

| Step | Action | Expected |
|---|---|---|
| 9a | Mute audio via the SFX toggle | `wc_sfx_muted = '1'` in localStorage. Game is silent. |
| 9b | Disconnect → reconnect | Audio stays muted (restored from `settings.sfxMuted` in payload). |
| 9c | Connect on Device B (fresh, no localStorage) | Audio is muted — pulled from server `settings.sfxMuted: true`. |
| 9d | Unmute on Device B | Audio plays. Reconnect Device B — stays unmuted. Reconnect Device A — Device A keeps its own local preference (local wins on pull). |

**Failure mode to watch:** audio resets to on every new device →
`settings` not in payload (was the gap we fixed in this PR).

---

## Regression tests (run after each scenario)

These can be run quickly between scenarios to confirm no side effects:

- [ ] Debug Menu → "Reset Progress" wipes levels, premium, events, daily — does **not** wipe Gems/hints (server-authoritative)
- [ ] Wallet disconnect flushes pending push, wipes local stores, returns to Splash
- [ ] Page reload (no disconnect) — all state restores from localStorage without hitting the network
- [ ] First-wallet welcome bonus fires **only once** across all devices for the same wallet — not on second connect, not after localStorage clear

---

## API smoke tests (curl / Postman)

Run these against the Vercel preview URL with a valid JWT:

```bash
# Health
curl https://<your-deploy>.vercel.app/api/health

# Profile pull — verify balances + inventory are present
curl -H "Authorization: Bearer <jwt>" \
  https://<your-deploy>.vercel.app/api/profile

# Expected shape:
# {
#   "address": "0x...",
#   "payload": { "v": 1, "economy": {...}, "progress": {...}, "cosmetics": {...}, "settings": {...} },
#   "balances": { "gems": N, "hints": N },
#   "inventory": { "ownedSkins": [...], "unlockedPremium": [...], "eventUnlocks": [...] }
# }
```

Key things to verify in the response:
- `payload.settings` is present (confirms audio sync)
- `inventory` is present (confirms server inventory pipeline is live)
- `balances.gems` and `balances.hints` are non-null integers

---

## Known non-issues

| Observation | Why it's fine |
|---|---|
| Vite build fails in Linux CI with `rolldown MODULE_NOT_FOUND` | Native binding installed for Windows; not our code. `tsc --noEmit` exits 0. Build succeeds on Windows / Vercel builders. |
| `wc_sfx_muted` in localStorage and `settings.sfxMuted` in server can temporarily disagree | By design — local preference wins on pull. They converge after the 2 s debounced push. |
| Event `claimed` flag is only in JSONB payload, not in `balance_transactions` | Acceptable for testnet. Claiming a reward is a one-way server action (Gems credited); the UI gate is the payload flag. Worst case: UI shows claim button again, but the endpoint will re-check and not double-pay. |

---

## Summary of code changes in this pass

| File | What changed |
|---|---|
| `src/store/progressStore.ts` | Added `reconcileInventory()` — safe additive reconcile of server inventory (premium unlocks + event week unlocks) without triggering level-wipe side effects. |
| `src/utils/profileSync.ts` | (1) Added `settings: { sfxMuted }` to `PlayerStatePayload`, `buildPayload`, `mergePayloads`, `applyPayload`. (2) Added `inventory` field to `ServerResponse`. (3) In `pullAndApply`, after JSONB merge, applied `resp.inventory` via `cosmeticsStore.setOwnedSkins` and `progressStore.reconcileInventory`. |
