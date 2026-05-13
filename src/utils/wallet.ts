// ─────────────────────────────────────────────────────────────────────────────
// Wallet primitives for MetaMask + Gala Wallet (EIP-1193 providers).
// Reference: docs/wallet/WALLET_AUTH.md
//
// v1 scope (this file):
//   • Detect which providers are injected on window.
//   • Request accounts and normalize the returned address.
//   • Wrap personal_sign for nonce / login flows.
//   • Subscribe to accountsChanged / chainChanged.
//
// Deliberately NOT in v1:
//   • EIP-55 checksumming. We don't call any GalaChain APIs yet, so an
//     unchecksummed address is fine for storage + display. When we add the
//     /api/asset/public-key-contract lookup or real DTO submission, we'll
//     pull in ethers.getAddress() (or hand-roll EIP-55) and call it at the
//     API boundary as the doc prescribes.
//   • EIP-712 typed-data signing (Gala Wallet payment DTOs).
//   • Server-signed DTO low-S normalization.
//   • client|<id> alias resolution.
// ─────────────────────────────────────────────────────────────────────────────

export type WalletType = 'metamask' | 'gala'

export interface ConnectedWallet {
  address:    string        // canonical "0x..." form, lowercase
  walletType: WalletType
  chainId:    string | null
}

// Minimal EIP-1193 provider shape. Both window.ethereum and window.gala
// follow this; we keep the typing local rather than importing a dependency.
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

// ── Provider lookup ─────────────────────────────────────────────────────────

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

// ── Address normalization ───────────────────────────────────────────────────
// Gala Wallet returns "eth|<EIP55>" from eth_requestAccounts. MetaMask
// returns "0x<EIP55>". For storage we use lowercase 0x form so equality
// checks across the app are trivially correct. The signing call needs the
// 0x form too — eth_requestAccounts → personal_sign always requires 0x.
//
// Reference: WALLET_AUTH.md §2 (table) and §10 caveat #8.

export function toSigningAddress(addr: string): string {
  if (addr.startsWith('eth|')) return '0x' + addr.slice(4)
  if (addr.startsWith('0x'))   return addr
  // Bare hex (legacy, 40-char) — prepend 0x.
  if (/^[a-fA-F0-9]{40}$/.test(addr)) return '0x' + addr
  return addr
}

export function normalizeStored(addr: string): string {
  return toSigningAddress(addr).toLowerCase()
}

/** Returns 'gala' for client|… or eth|… addresses, 'metamask' for 0x…
 *  Used when restoring from storage if walletType wasn't persisted. */
export function walletKindFromAddress(addr: string): WalletType {
  if (addr.startsWith('client|') || addr.startsWith('eth|')) return 'gala'
  return 'metamask'
}

/** Pretty truncate "0xabc...def" for UI pills. */
export function shortAddress(addr: string, head = 6, tail = 4): string {
  if (!addr) return ''
  const a = addr.startsWith('0x') ? addr : '0x' + addr
  if (a.length <= head + tail + 2) return a
  return `${a.slice(0, head)}…${a.slice(-tail)}`
}

// ── Connect / sign ──────────────────────────────────────────────────────────

export async function connectWallet(type: WalletType): Promise<ConnectedWallet> {
  const provider = providerFor(type)
  if (!provider) throw new Error(`${type === 'metamask' ? 'MetaMask' : 'Gala Wallet'} not detected. Install the browser extension and try again.`)

  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
  if (!accounts || accounts.length === 0) throw new Error('No accounts available — did you cancel the wallet prompt?')

  let chainId: string | null = null
  try { chainId = (await provider.request({ method: 'eth_chainId' })) as string } catch { /* not critical */ }

  return {
    address:    normalizeStored(accounts[0]),
    walletType: type,
    chainId,
  }
}

/** Wraps `personal_sign`. Returns the 0x-prefixed signature hex. The
 *  signing address must be in 0x… form — we normalize via toSigningAddress. */
export async function signMessage(type: WalletType, address: string, message: string): Promise<string> {
  const provider = providerFor(type)
  if (!provider) throw new Error('Wallet provider not available')
  const signingAddr = toSigningAddress(address)
  return await provider.request({
    method: 'personal_sign',
    params: [message, signingAddr],
  }) as string
}

// ── Event listeners ─────────────────────────────────────────────────────────
// Both providers emit standard EIP-1193 events. The returned unsubscribe
// function removes both listeners; call it before reconnecting or on
// component unmount.

export function subscribeWalletEvents(
  type: WalletType,
  onAccountsChanged: (accounts: string[]) => void,
  onChainChanged:    (chainId: string)    => void,
): () => void {
  const provider = providerFor(type)
  if (!provider || !provider.on) return () => {}

  provider.on('accountsChanged', onAccountsChanged)
  provider.on('chainChanged', onChainChanged)

  return () => {
    provider.removeListener?.('accountsChanged', onAccountsChanged)
    provider.removeListener?.('chainChanged',    onChainChanged)
  }
}
