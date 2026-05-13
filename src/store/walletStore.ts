// ─────────────────────────────────────────────────────────────────────────────
// Wallet store — connection state for MetaMask / Gala Wallet (v1 soft connect).
//
// Persists to localStorage under `wc_wallet_v1` so the wallet stays connected
// across reloads. Subscribes to the active provider's EIP-1193 events so:
//   • accountsChanged → updates the stored address (or disconnects on [])
//   • chainChanged    → updates chainId
//
// What v1 deliberately does NOT do:
//   • Sign a server-side nonce. There's no backend yet. The address is
//     trusted from the client perspective only — it's a UX identity, not
//     authentication. Anything that requires verified ownership (premium
//     purchases credited to the address, real leaderboard ranking) waits
//     for v2 + a backend that runs the nonce-verify flow.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import {
  connectWallet as connectProvider,
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
}

interface WalletState extends Partial<PersistedWallet> {
  // UI
  connecting: boolean
  error:      string | null

  // Actions
  connect:     (type: WalletType) => Promise<boolean>
  disconnect:  () => void
  restore:     () => void
}

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
    }
  } catch { return null }
}

let unsub: (() => void) | null = null

export const useWalletStore = create<WalletState>((set, get) => {
  const initial = load()

  // Re-attach listeners if we already had a connection in localStorage.
  if (initial) {
    queueMicrotask(() => attachListeners(initial.walletType))
  }

  function attachListeners(type: WalletType) {
    if (unsub) { unsub(); unsub = null }
    unsub = subscribeWalletEvents(
      type,
      (accounts: string[]) => {
        if (!accounts || accounts.length === 0) {
          // User disconnected from the extension. Drop our local state too.
          get().disconnect()
          return
        }
        const next: PersistedWallet = {
          address:    normalizeStored(accounts[0]),
          walletType: type,
          chainId:    get().chainId ?? null,
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
    connecting: false,
    error:      null,

    connect: async (type) => {
      set({ connecting: true, error: null })
      try {
        const result: ConnectedWallet = await connectProvider(type)
        save(result)
        set({ ...result, connecting: false, error: null })
        attachListeners(type)
        return true
      } catch (e: any) {
        set({ connecting: false, error: e?.message ?? 'Failed to connect wallet' })
        return false
      }
    },

    disconnect: () => {
      save(null)
      if (unsub) { unsub(); unsub = null }
      set({ address: undefined, walletType: undefined, chainId: undefined, error: null, connecting: false })
    },

    restore: () => {
      const persisted = load()
      if (!persisted) return
      set(persisted)
      attachListeners(persisted.walletType)
    },
  }
})
