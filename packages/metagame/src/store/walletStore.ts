// ─────────────────────────────────────────────────────────────────────────────
// Wallet store — shared across all Gala Games metagame apps.
//
// Game-specific disconnect logic (wipe progress, flush profile sync, navigate
// to splash) is injected via registerDisconnectHandler() so this store stays
// decoupled from any particular game's stores.
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

const STORAGE_KEY = 'gala_wallet_v1'

interface PersistedWallet {
  address:    string
  walletType: WalletType
  chainId:    string | null
  jwt:        string | null
}

interface WalletState extends Partial<PersistedWallet> {
  connecting: boolean
  loggingIn:  boolean
  error:      string | null

  connect:         (type: WalletType) => Promise<boolean>
  login:           () => Promise<boolean>
  connectAndLogin: (type: WalletType) => Promise<boolean>
  disconnect:      () => Promise<void>
  restore:         () => void
  clearJwt:        () => void
}

// ── Disconnect handler injection ──────────────────────────────────────────────
// Each game calls registerDisconnectHandler() in its App.tsx or main.tsx.
// The handler receives the current JWT (still set, so it can flush any
// pending server sync before wiping), then should wipe all local state and
// navigate to splash.

type DisconnectHandler = (jwtBeforeWipe: string | null) => Promise<void>
let _onDisconnect: DisconnectHandler | null = null

export function registerDisconnectHandler(fn: DisconnectHandler): void {
  _onDisconnect = fn
}

// ── Persistence ───────────────────────────────────────────────────────────────

function save(payload: PersistedWallet | null): void {
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
    // Require both address and jwt — an entry with no jwt means the player
    // never completed the sign-in flow (e.g. refreshed during the MetaMask
    // popup). Treat it as disconnected so the UI doesn't show a stale address.
    if (!obj.address || !obj.jwt) return null
    return {
      address:    normalizeStored(obj.address),
      walletType: obj.walletType ?? walletKindFromAddress(obj.address),
      chainId:    obj.chainId ?? null,
      jwt:        obj.jwt ?? null,
    }
  } catch { return null }
}

let unsub: (() => void) | null = null

// ── Store ─────────────────────────────────────────────────────────────────────

export const useWalletStore = create<WalletState>((set, get) => {
  const initial = load()
  if (initial) queueMicrotask(() => attachListeners(initial.walletType))

  function attachListeners(type: WalletType) {
    if (unsub) { unsub(); unsub = null }
    unsub = subscribeWalletEvents(
      type,
      (accounts: string[]) => {
        if (!accounts || accounts.length === 0) { get().disconnect(); return }
        const nextAddr = normalizeStored(accounts[0])
        const cur = get()
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
        const next: PersistedWallet = { address: cur.address, walletType: cur.walletType, chainId, jwt: cur.jwt ?? null }
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
        // Do NOT save() here — persist only after login() completes with a JWT.
        // Saving address without a JWT would make a mid-flow page refresh look
        // "connected" in the UI even though the player is not authenticated.
        set({ ...next, connecting: false, error: null })
        attachListeners(type)
        return true
      } catch (e: any) {
        set({ connecting: false, error: e?.message ?? 'Failed to connect wallet' })
        return false
      }
    },

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
          address: cur.address, walletType: cur.walletType, chainId: cur.chainId ?? null, jwt: verifyResp.jwt,
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
      return get().login()
    },

    disconnect: async () => {
      const jwtBeforeWipe = get().jwt ?? null
      // Signal "logged out" to subscribers before wiping — prevents any
      // in-flight sync from writing with a stale JWT.
      set({ jwt: null })
      // Let the game handle its own state cleanup (flush sync, wipe progress, go to splash).
      await _onDisconnect?.(jwtBeforeWipe)
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
      const next: PersistedWallet = { address: cur.address, walletType: cur.walletType, chainId: cur.chainId ?? null, jwt: null }
      save(next)
      set({ jwt: null })
    },
  }
})
