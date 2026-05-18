// Shared wallet-address parser. Every endpoint that accepts a wallet
// address as input must run input through this helper before doing
// anything else.
//
// The four formats that flow in from MetaMask and Gala Wallet (per
// docs/galachain/WALLET_AUTH.md §1, §5):
//
//   0x<addr>             — MetaMask / standard ETH
//   eth|<addr>           — GalaChain normalized
//   client|<24-hex>      — Gala Wallet native identity (MongoDB ObjectId)
//   <addr> (bare 40-hex) — legacy
//
// Why this exists: the doc explicitly calls out a strict
// /^0x[a-f0-9]{40}$/i regex at the route boundary as the #1 cause of
// "Failed to fetch nonce" — it silently rejects every Gala Wallet user
// whose connect call returned `eth|...`. Our React client normalizes
// before posting, but defense in depth: server-to-server callers, curl
// tests, and any future code path that forgets to normalize must still
// work.
//
// EIP-55 checksumming is applied at this boundary too — see doc §3 and
// §10.1: GalaChain public-key-contract lookups (and the future client|
// alias resolution) fail silently with un-checksummed addresses.

import { getAddress } from 'ethers'

export type ParsedAddress =
  | { kind: 'eth';    stored: string; gala: string }
    // stored: lowercase 0x<addr>            (storage key / equality)
    // gala:   eth|<EIP55-addr>              (gateway-facing form)
  | { kind: 'client'; stored: string; gala: string }
    // stored: client|<lower>                (storage key)
    // gala:   client|<lower>                (same — passed through to gateway)

/** Parse and normalize a wallet address from any of the four supported
 *  formats. Throws TypeError on garbage input — do not silently fall
 *  through, that's the same class of bug as the strict-regex one. */
export function parseWalletAddress(input: unknown): ParsedAddress {
  if (typeof input !== 'string') {
    throw new TypeError('address must be a string')
  }
  const raw = input.trim()

  // client|<id> — pass through, never convert to eth|. Doc §10.5: using
  // eth| for a user who has a client| identity credits the wrong on-chain
  // account.
  if (raw.startsWith('client|')) {
    const id = raw.slice(7)
    if (!/^[a-f0-9]{24}$/i.test(id)) {
      throw new TypeError('invalid client| identity — expected 24-hex MongoDB ObjectId')
    }
    const canonical = `client|${id.toLowerCase()}`
    return { kind: 'client', stored: canonical, gala: canonical }
  }

  // eth|<addr>, 0x<addr>, or bare hex — all collapse to the ETH path.
  let hex = raw.startsWith('eth|') ? raw.slice(4) : raw
  if (hex.startsWith('0x') || hex.startsWith('0X')) hex = hex.slice(2)
  if (!/^[a-f0-9]{40}$/i.test(hex)) {
    throw new TypeError('invalid ETH address — expected 40-char hex with optional 0x/eth| prefix')
  }

  // ethers.getAddress applies EIP-55 (uppercase a nibble when the
  // corresponding keccak digest nibble is ≥ 8). Throws on bad input,
  // which we relabel for clarity.
  let checksummed: string
  try {
    checksummed = getAddress('0x' + hex)
  } catch {
    throw new TypeError('invalid ETH address — failed EIP-55 checksum')
  }

  return {
    kind:   'eth',
    stored: checksummed.toLowerCase(),       // we store lowercase for equality checks
    gala:   `eth|${checksummed.slice(2)}`,   // gala form is eth| + EIP-55 hex, no 0x
  }
}

/** Convenience: parse and return just the canonical stored form. Use at
 *  endpoint boundaries when you only need the storage key. Throws on
 *  invalid input — let the route handler convert to a 400. */
export function parseStored(input: unknown): string {
  return parseWalletAddress(input).stored
}
