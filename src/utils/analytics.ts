// ─────────────────────────────────────────────────────────────────────────────
// Client-side analytics utility.
//
// USAGE
//   import { track } from '../utils/analytics'
//   track('shop_opened', { entry_point: 'hint_denied', current_gems: 40 })
//
// DESIGN
//   • Fire-and-forget: never throws, never awaits.
//   • Posts to /api/analytics/track (first-party relay) so ad-blockers
//     can't strip the events.
//   • The server injects the authoritative wallet address from the JWT,
//     so the client never needs to include it manually.
// ─────────────────────────────────────────────────────────────────────────────

const ORIGIN = (import.meta as any).env?.VITE_API_ORIGIN ?? ''

/**
 * Fire-and-forget client event. Safe to call anywhere — never throws,
 * never blocks rendering.
 *
 * @param event      — snake_case event name matching the analytics spec
 * @param properties — event-specific payload (no need to include address —
 *                     the server reads it from the JWT automatically)
 */
export function track(
  event:       string,
  properties?: Record<string, unknown>,
): void {
  _track(event, properties).catch(() => {/* swallow — analytics must never crash the game */})
}

async function _track(
  event:       string,
  properties?: Record<string, unknown>,
): Promise<void> {
  // Read JWT lazily to avoid a circular import at module load time.
  let jwt: string | null = null
  try {
    const { useWalletStore } = await import('../store/walletStore')
    jwt = useWalletStore.getState().jwt ?? null
  } catch {}

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`

  await fetch(`${ORIGIN}/api/analytics/track`, {
    method:  'POST',
    headers,
    body:    JSON.stringify({ event, properties: properties ?? {} }),
    // Hard 4s timeout — if the relay is slow, don't hang the UI.
    signal:  AbortSignal.timeout(4_000),
  })
}
