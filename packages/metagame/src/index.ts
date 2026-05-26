// @gala-games/metagame — public API

export { useWalletStore, registerDisconnectHandler } from './store/walletStore'
export { apiFetch, api } from './utils/apiClient'
export {
  connectWallet, signMessage, subscribeWalletEvents,
  detectWallets, providerFor, normalizeStored, walletKindFromAddress,
  toSigningAddress,
  type WalletType, type ConnectedWallet, type Eip1193Provider,
} from './utils/wallet'
export {
  playSfx, isSfxMuted, setSfxMuted, unlockSfx,
  registerVoices, zzfxPlay, playSample,
} from './utils/sfxEngine'
export { default as WalletConnectModal } from './components/WalletConnectModal'
export type { MetaScreen, GameMode } from './types'
