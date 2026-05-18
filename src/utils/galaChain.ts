// GalaChain TransferToken DTO construction + signing.
//
// We use @gala-chain/api for the deterministic-JSON helper
// (`signatures.getPayloadToSign`) and route the actual signing through our
// existing wallet abstraction (src/utils/wallet.ts → personal_sign on
// whichever provider is connected). This gives us:
//
//   • The doc-recommended override pattern from TOKEN_OPS.md "Browser",
//     which fixes the v2.x SDK MISSING_SIGNER bugs.
//   • Uniform support for both MetaMask (window.ethereum) and Gala Wallet
//     (window.gala), instead of fighting BrowserConnectClient's
//     window.ethereum default.
//
// References:
//   docs/galachain/TOKEN_OPS.md  — sign override, DTO rules
//   docs/galachain/WALLET_AUTH.md §6 — EIP-191 signature shape

import { signatures } from '@gala-chain/api'
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

/** 32 random bytes, base64-encoded. Required on every write DTO for
 *  replay protection — the chain rejects duplicate uniqueKeys. */
function uniqueKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
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
    uniqueKey:     uniqueKey(),
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
  // `signatures.getPayloadToSign` returns a sorted-keys, no-whitespace
  // string. The SDK runtime is JS-only so this is safe to call in the
  // browser. If the installed @gala-chain/api version doesn't export
  // `signatures.getPayloadToSign`, the TS error here is the right
  // place to find out.
  const data: string = (signatures as any).getPayloadToSign(payload)

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
