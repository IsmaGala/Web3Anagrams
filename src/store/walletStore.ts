// ─────────────────────────────────────────────────────────────────────────────
// Wallet store — connection state for MetaMask / Gala Wallet.
//
// v1: soft connect — just stored the address client-side, no server.
// v2: real login — after connecting, the player signs a server-issued nonce
//     and the server returns a JWT we attach to authenticated requests
//     (leaderboard score submissions, "your rank" lookups, future profile
//     sync). The JWT and address are persisted to localStorage under
//     `wc_wallet_v1`.
//
// Reference: docs/wallet/WALLET_AUTH.md §5
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import {
  connectWallet as connectProvider,
  signMessage,
  subscribeWalletEvents,
  walletKindFromAddress,
  normalizeStored,
  type ConnectedWallet,
  type WalletType,
} from '../utils/wallet'

const STORAGE_KEY = 'wc_wallet_v1'

interface PersistedWallet {
  address:    string
  walletType: WalletType
  chainId:    string | null
  jwt:        string | null
}

interface WalletState extends Partial<PersistedWallet> {
  // UI
  connecting: boolean
  loggingIn:  boolean
  error:      string | null

  // Actions
  connect:        (type: WalletType) => Promise<boolean>
  login:          () => Promise<boolean>     // sign nonce → exchange for JWT
  connectAndLogin:(type: WalletType) => Promise<boolean>
  disconnect:     () => Promise<void>        // flushes pending sync, wipes local state
  restore:        () => void
  clearJwt:       () => void
}

// ── Persistence ─────────────────────────────────────────────────────────────

function save(payload: PersistedWallet | null) {
  try {
    if (payload) localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    else         localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

function load(): PersistedWallet | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw) as Partial<PersistedWallet>
    if (!obj.address) return null
    return {
      address:    normalizeStored(obj.address),
      walletType: obj.walletType ?? walletKindFromAddress(obj.address),
      chainId:    obj.chainId ?? null,
      jwt:        obj.jwt ?? null,
    }
  } catch { return null }
}

let unsub: (() => void) | null = null

// ── Store ───────────────────────────────────────────────────────────────────

export const useWalletStore = create<WalletState>((set, get) => {
  const initial = load()

  if (initial) {
    queueMicrotask(() => attachListeners(initial.walletType))
  }

  function attachListeners(type: WalletType) {
    if (unsub) { unsub(); unsub = null }
    unsub = subscribeWalletEvents(
      type,
      (accounts: string[]) => {
        if (!accounts || accounts.length === 0) {
          get().disconnect()
          return
        }
        const nextAddr = normalizeStored(accounts[0])
        const cur = get()
        // If the user switched accounts in the extension, the old JWT is
        // bound to the old address. Drop it; let them re-login.
        const sameAddress = cur.address === nextAddr
        const next: PersistedWallet = {
          address:    nextAddr,
          walletType: type,
          chainId:    cur.chainId ?? null,
          jwt:        sameAddress ? (cur.jwt ?? null) : null,
        }
        save(next)
        set(next)
      },
      (chainId: string) => {
        const cur = get()
        if (!cur.address || !cur.walletType) return
        const next: PersistedWallet = {
          address:    cur.address,
          walletType: cur.walletType,
          chainId,
          jwt:        cur.jwt ?? null,
        }
        save(next)
        set({ chainId })
      },
    )
  }

  return {
    address:    initial?.address,
    walletType: initial?.walletType,
    chainId:    initial?.chainId,
    jwt:        initial?.jwt ?? null,
    connecting: false,
    loggingIn:  false,
    error:      null,

    connect: async (type) => {
      set({ connecting: true, error: null })
      try {
        const result: ConnectedWallet = await connectProvider(type)
        const next: PersistedWallet = { ...result, jwt: null }
        save(next)
        set({ ...next, connecting: false, error: null })
        attachListeners(type)
        return true
      } catch (e: any) {
        set({ connecting: false, error: e?.message ?? 'Failed to connect wallet' })
        return false
      }
    },

    // Lazy-import the apiClient so the wallet store doesn't depend on it
    // directly at module-load time (avoids circular imports during the
    // initial render).
    login: async () => {
      const cur = get()
      if (!cur.address || !cur.walletType) {
        set({ error: 'Connect a wallet before logging in' })
        return false
      }
      set({ loggingIn: true, error: null })
      try {
        const { api } = await import('../utils/apiClient')
        const nonceResp = await api.post<{ nonce: string; expiresAt: string }>(
          '/api/auth/nonce',
          { address: cur.address },
        )
        const signature = await signMessage(cur.walletType, cur.address, nonceResp.nonce)
        const verifyResp = await api.post<{ jwt: string; address: string; expiresIn: number }>(
          '/api/auth/verify',
          { address: cur.address, signature },
        )
        const next: PersistedWallet = {
          address:    cur.address,
          walletType: cur.walletType,
          chainId:    cur.chainId ?? null,
          jwt:        verifyResp.jwt,
        }
        save(next)
        set({ jwt: verifyResp.jwt, loggingIn: false, error: null })
        return true
      } catch (e: any) {
        set({ loggingIn: false, error: e?.message ?? 'Login failed' })
        return false
      }
    },

    connectAndLogin: async (type) => {
      const connected = await get().connect(type)
      if (!connected) return false
      return await get().login()
    },

    disconnect: async () => {
      // Wallet = identity. Disconnecting must return the device to a
      // pre-login state: no progress, no premium unlocks, no economy. The
      // server is the source of truth — reconnecting pulls everything back
      // via profileSync.pullAndApply.
      //
      // The order is load-bearing:
      //   1. flushPush — persist anything in the 2s debounce window. JWT
      //      is still set here so the push authenticates.
      //   2. Clear JWT in the wallet store. schedulePush early-returns on
      //      a missing JWT, so any subscriber fired by the upcoming wipes
      //      becomes a no-op — that prevents the wiped state from being
      //      pushed to the server.
      //   3. cancelPendingPush — kill any timer flushPush didn't catch
      //      (and re-cancel after the wipes for belt-and-suspenders).
      //   4. Wipe in-memory + localStorage state: progress, premium, events,
      //      daily, economy. Navigate the UI to splash.
      //   5. Clear the rest of the wallet state and detach listeners.
      //
      // Each dynamic import is wrapped in try/catch so a stale import map
      // can't prevent the wallet from disconnecting.
      try {
        const { flushPush } = await import('../utils/profileSync')
        await flushPush()
      } catch {}

      // Clear the JWT BEFORE wiping state — see comment above. The rest of
      // the wallet fields stay set so subscribers (e.g. leaderboard panel)
      // see "logged out" rather than "wiped mid-render".
      set({ jwt: null })

      try {
        const { cancelPendingPush } = await import('../utils/profileSync')
        cancelPendingPush()
        const { useProgressStore } = await import('./progressStore')
        useProgressStore.getState().reset()
        const { wipeEconomy, useGameStore } = await import('./gameStore')
        wipeEconomy()
        useGameStore.getState().goToSplash()
        cancelPendingPush()   // safety: any stragglers scheduled during wipes
      } catch {}

      save(null)
      if (unsub) { unsub(); unsub = null }
      set({ address: undefined, walletType: undefined, chainId: undefined, error: null, connecting: false, loggingIn: false })
    },

    restore: () => {
      const persisted = load()
      if (!persisted) return
      set(persisted)
      attachListeners(persisted.walletType)
    },

    clearJwt: () => {
      const cur = get()
      if (!cur.address || !cur.walletType) return
      const next: PersistedWallet = {
        address:    cur.address,
        walletType: cur.walletType,
        chainId:    cur.chainId ?? null,
        jwt:        null,
      }
      save(next)
      set({ jwt: null })
    },
  }
})
