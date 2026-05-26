// ─────────────────────────────────────────────────────────────────────────────
// Wallet store — re-exported from @gala-games/metagame.
//
// Game-specific disconnect logic (flush profileSync, wipe stores, go to splash)
// is registered in App.tsx via registerDisconnectHandler() rather than being
// baked into the store itself, keeping the store decoupled from game code.
// ─────────────────────────────────────────────────────────────────────────────
export { useWalletStore, registerDisconnectHandler } from '@gala-games/metagame'
