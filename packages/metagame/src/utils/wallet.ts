// ─────────────────────────────────────────────────────────────────────────────
// Wallet primitives for MetaMask + Gala Wallet (EIP-1193 providers).
// Pure browser-API utilities — no game logic, no React, no stores.
// ─────────────────────────────────────────────────────────────────────────────

export type WalletType = 'metamask' | 'gala'

export interface ConnectedWallet {
  address:    string        // canonical "0x..." form, lowercase
  walletType: WalletType
  chainId:    string | null
}

export interface Eip1193Provider {
  request: (args: { method: string; params?: any[] | object }) => Promise<any>
  on?:        (event: string, handler: (...args: any[]) => void) => void
  removeListener?: (event: string, handler: (...args: any[]) => void) => void
  isMetaMask?: boolean
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
    gala?:     Eip1193Provider
  }
}

export function providerFor(type: WalletType): Eip1193Provider | null {
  if (typeof window === 'undefined') return null
  if (type === 'metamask') return window.ethereum ?? null
  if (type === 'gala')     return window.gala ?? null
  return null
}

export function detectWallets(): { metamask: boolean; gala: boolean } {
  if (typeof window === 'undefined') return { metamask: false, gala: false }
  return {
    metamask: !!window.ethereum,
    gala:     !!window.gala,
  }
}

export function toSigningAddress(addr: string): string {
  if (addr.startsWith('eth|')) return '0x' + addr.slice(4)
  if (addr.startsWith('0x'))   return addr
  if (/^[a-fA-F0-9]{40}$/.test(addr)) return '0x' + addr
  return addr
}

export function normalizeStored(addr: string): string {
  return toSigningAddress(addr).toLowerCase()
}

export function walletKindFromAddress(addr: string): WalletType {
  return addr.startsWith('eth|') ? 'gala' : 'metamask'
}

export async function connectWallet(type: WalletType): Promise<ConnectedWallet> {
  const provider = providerFor(type)
  if (!provider) throw new Error(`${type} wallet not found`)

  const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' })
  if (!accounts || accounts.length === 0) throw new Error('No accounts returned')

  let chainId: string | null = null
  try {
    chainId = await provider.request({ method: 'eth_chainId' })
  } catch { /* non-fatal */ }

  return {
    address:    normalizeStored(accounts[0]),
    walletType: type,
    chainId,
  }
}

export async function signMessage(type: WalletType, address: string, message: string): Promise<string> {
  const provider = providerFor(type)
  if (!provider) throw new Error(`${type} wallet not found`)
  const signing = toSigningAddress(address)
  return provider.request({ method: 'personal_sign', params: [message, signing] })
}

export function subscribeWalletEvents(
  type: WalletType,
  onAccountsChanged: (accounts: string[]) => void,
  onChainChanged: (chainId: string) => void,
): () => void {
  const provider = providerFor(type)
  if (!provider?.on) return () => {}
  provider.on('accountsChanged', onAccountsChanged)
  provider.on('chainChanged', onChainChanged)
  return () => {
    provider.removeListener?.('accountsChanged', onAccountsChanged)
    provider.removeListener?.('chainChanged', onChainChanged)
  }
}
