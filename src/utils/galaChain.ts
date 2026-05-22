// GalaChain TransferToken DTO construction + signing.
//
// Routes signing through our existing wallet abstraction
// (src/utils/wallet.ts → personal_sign on whichever provider is connected).
// Matches the team's working PoC byte-for-byte:
//   • Hand-rolled deterministic JSON (sorted keys, no whitespace).
//   • EIP-191 prefix with byte-length, ASCII-safe.
//   • personal_sign returns the 0x-prefixed signature.
//   • DTO + prefix + signature posted to /api/asset/token-contract/TransferToken.
//
// Note: this is the MetaMask path (EIP-191). Gala Wallet writes need
// EIP-712 typed-data signing per the team's doc (Section 2, Route B) —
// not yet wired here. For MetaMask players, this flow is complete.
//
// References:
//   docs/galachain/TOKEN_OPS.md       — sign override, DTO rules
//   docs/galachain/WALLET_AUTH.md §6  — EIP-191 signature shape
//   uploads/transfer-token-flow.md    — team's authoritative flow doc
//   uploads/index.js                  — working PoC (mirrors this file)

import { signMessage, type WalletType } from './wallet'

// Fungible GALA token class. The four-part composite key is the same on
// testnet and mainnet — only the gateway URL changes.
// `instance: '0'` is the magic value for fungibles per TOKEN_OPS.md.
export const GALA_TOKEN_INSTANCE = {
  collection:    'GALA',
  category:      'Unit',
  type:          'none',
  additionalKey: 'none',
  instance:      '0',
} as const

/** Deterministic JSON serializer: keys sorted alphabetically (recursive),
 *  no whitespace. The chain reconstructs the same string before recovering
 *  the signer — any mismatch (different key order, extra spaces) produces
 *  a different digest and the signature fails to verify.
 *
 *  We implement this ourselves rather than relying on the SDK helper to
 *  guarantee byte-for-byte parity with the team's working PoC (which
 *  hand-rolls it identically). */
export function deterministicJSON(v: unknown): string {
  if (Array.isArray(v)) {
    return '[' + v.map(deterministicJSON).join(',') + ']'
  }
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v as object).sort()
    return '{' + keys.map((k) =>
      JSON.stringify(k) + ':' + deterministicJSON((v as Record<string, unknown>)[k]),
    ).join(',') + '}'
  }
  return JSON.stringify(v)
}

/** Meaningful uniqueKey: project prefix + step + random tx id + timestamp +
 *  truncated from-address. Matches the PoC's pattern so the chain's replay
 *  protection works AND we can grep the chain history for a specific
 *  player's purchases. */
function uniqueKey(from: string): string {
  const txId      = (crypto as any).randomUUID?.() ?? Math.random().toString(36).slice(2)
  const hexTime   = Date.now().toString(16)
  const fromShort = from.length > 12 ? from.slice(0, 12) + '…' + from.slice(-4) : from
  return `wordchain-buy-${txId}-${hexTime}-${fromShort}`
}

export interface TransferGalaArgs {
  /** Sender in gala form: `eth|<EIP55>` (NOT `0x...`). */
  from:     string
  /** Recipient in gala form: `eth|<EIP55>` or `client|<id>`. */
  to:       string
  /** Decimal string. GALA has 8 decimals on-chain but stringified ints
   *  work for the integer-quantity case we use in the Gem Store. */
  quantity: string
}

/** Build an unsigned TransferToken DTO. The result is a plain object —
 *  pass it to `signGalaDto` next. */
export function buildTransferGalaDto(args: TransferGalaArgs): Record<string, unknown> {
  return {
    from:          args.from,
    to:            args.to,
    tokenInstance: { ...GALA_TOKEN_INSTANCE },
    quantity:      args.quantity,
    uniqueKey:     uniqueKey(args.from),
  }
}

/** Sign a GalaChain DTO with personal_sign and return the DTO with
 *  `prefix` and `signature` fields merged in — ready to POST to the
 *  gateway (or to our /api/store/purchase which forwards it).
 *
 *  This is the doc-recommended override pattern. Steps:
 *    1. Serialize the payload deterministically (sorted keys, no
 *       whitespace). That's what the chain hashes for verification.
 *    2. Compute the EIP-191 prefix bytes — `\x19Ethereum Signed
 *       Message:\n<byteLen>`. Sent alongside so the chain reconstructs
 *       the same hash.
 *    3. personal_sign over the deterministic JSON. Wallet shows the raw
 *       JSON in the prompt — not pretty but verifiable.
 *
 *  References:
 *    docs/galachain/TOKEN_OPS.md  "Browser (MetaMask)" — the override
 *    docs/galachain/WALLET_AUTH.md §6 — EIP-191 hash construction */
export async function signGalaDto(
  walletType:    WalletType,
  walletAddress: string,
  payload:       Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Hand-rolled deterministic JSON (matches the team's PoC byte-for-byte).
  // We previously used signatures.getPayloadToSign from @gala-chain/api,
  // but ditched that to remove any risk that the SDK's helper diverges
  // from what the chain reconstructs.
  const data = deterministicJSON(payload)

  // EIP-191 prefix. The leading '' (0x19 byte) is the spec-mandated
  // EM control character; dropping it makes the chain re-hash to a
  // different digest and recover the wrong address — silent failure.
  // We use the BYTE length (not the JS string length) so future non-ASCII
  // content doesn't desync the prefix length from personal_sign's own
  // hash construction.
  const byteLen = new TextEncoder().encode(data).length
  const prefix  = `Ethereum Signed Message:\n${byteLen}`

  const signature = await signMessage(walletType, walletAddress, data)

  return { ...payload, prefix, signature }
}
