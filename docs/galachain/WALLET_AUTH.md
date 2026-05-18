# Wallet Authentication Reference: GalaChain + MetaMask

A project-agnostic reference for implementing wallet authentication with Gala Wallet and MetaMask on GalaChain backends. Copy this file to any project that needs to support both wallet types.

---

## 1. Address Formats

Four formats exist in the GalaChain ecosystem. Confusing them is the most common source of bugs.

| Format | Example | Origin |
|--------|---------|--------|
| `0x...` | `0xA1b2C3d4...` | MetaMask / ERC-20 native format |
| `eth\|...` | `eth\|A1b2C3d4...` | GalaChain API normalized format (no `0x`, EIP-55 checksummed) |
| `client\|...` | `client\|66843748c6c4a0d9...` | Gala Wallet identity (24-char MongoDB ObjectId) |
| bare hex | `a1b2c3d4...` (40 chars) | Legacy; treat like `0x` after prepending |

**Normalization rules:**
- Always apply **EIP-55 checksum** before using an address with GalaChain. EIP-55 algorithm: for each hex character of the address, uppercase it if the corresponding nibble of `keccak256(lowercase_address_without_0x)` is >= 8. Every language has a library for this (`ethers.js`, `web3.py`, `go-ethereum`, etc.).
- `0x<addr>` -> `eth|<EIP55-addr>` when calling GalaChain APIs.
- `client|<id>` -> returned as-is; never convert to `eth|`.
- 40-char bare hex -> prepend `0x`, then normalize to `eth|`.
- `eth|` strips the `0x` prefix: `eth|A1b2...` not `eth|0xA1b2...` (easy to double-add).

**Storage convention:** Store `0x<EIP55>` in the database. Convert to GalaChain formats (`eth|` or `client|`) only at the API boundary, never deeper in the stack.

---

## 2. How to Detect Wallet Type

```
starts with "client|"  ->  Gala Wallet (native ObjectId identity)
starts with "eth|"     ->  Gala Wallet with ETH address OR MetaMask (use alias resolution to confirm)
starts with "0x"       ->  MetaMask / standard ETH wallet
```

**Browser providers:**

| Wallet | Browser object | API style |
|--------|---------------|-----------|
| MetaMask | `window.ethereum` | `window.ethereum.request({ method, params })` |
| Gala Wallet | `window.gala` | `window.gala.request({ method, params })` — same RPC style, separate provider |

Both follow the same EIP-1193 `request()` interface, so client code can be written generically against the provider object.

**`eth_requestAccounts` return format:**

| Wallet | Address format returned |
|--------|------------------------|
| MetaMask | `0x<EIP55>` — standard ETH format |
| Gala Wallet | `eth|<EIP55>` — GalaChain format, **not** `0x` |

Always normalize to `0x` before passing the address to `personal_sign` (EIP-1193 expects `0x` format):
```js
const signingAddr = address.startsWith('eth|') ? '0x' + address.slice(4) : address;
```

**Signing method by context:**

| Context | MetaMask | Gala Wallet |
|---------|----------|-------------|
| Nonce login | `personal_sign` -> plain hex string `"0xabc..."` | `personal_sign` -> plain hex string `"0xabc..."` |
| Payment DTO | `personal_sign` -> plain hex string | `signTypedData_v4` -> JSON envelope `{"signature":"0x...","types":{...},"domain":{...}}` |

**Important:** both wallets use `personal_sign` for nonce-based login. EIP-712 (`signTypedData_v4`) is only used by Gala Wallet for payment DTOs, not for authentication.

---

## 3. Getting the Gala Alias (client| identity)

MetaMask users may have a registered GalaChain alias (`client|...`). To resolve it:

**Endpoint:**
```
GET {GALACHAIN_GATEWAY}/api/asset/public-key-contract/GetObjectByKey
```

**Lookup key (composite key format):**
```
\x00GCUP\x00{EIP55-checksummed-address}\x00
```

**Response:** `client|<24-char-id>` if the wallet is registered, empty / 404 otherwise.

**Rules:**
- The address **must be EIP-55 checksummed** before building the key — silent failure if not.
- This endpoint requires no authentication.
- Cache the alias per-session; it does not change.
- Resolution is **non-fatal**: if not found, fall back to `eth|<addr>` for GalaChain calls.
- Prefer `client|` alias over `eth|` for all GalaChain **write** operations when available. Using `eth|` for a user who has a `client|` identity will credit the wrong account.

---

## 4. Getting the ETH Address from a `client|` Identity

If you have a `client|` address and need the underlying ETH address:

**Endpoint:**
```
GET {GALA_SWAP_BASE_URL}/GetPublicKey?clientId={client|id}
```

**Response:** base64-encoded compressed secp256k1 public key (33 bytes).

**Derivation steps:**
1. Base64-decode -> 33 bytes (compressed point)
2. Decompress the secp256k1 point -> 64-byte uncompressed coordinates
3. ETH address = last 20 bytes of `keccak256(uncompressed_pubkey[1:])` -> prepend `0x` + EIP-55 checksum

---

## 5. Nonce Authentication Flow

Standard "sign a nonce" login, with the critical wallet-type difference:

```
1. Server generates a random nonce (e.g. UUID), stores it with a TTL (~5 min), keyed by wallet address
2. Client signs the nonce message with their wallet
3. Server recovers the signer address from the signature
4. Server verifies: recovered address == registered wallet address
5. Server invalidates the nonce (one-time use — never reuse)
6. Server issues JWT
```

### Server-side address parser — accept all four formats

The single most common cause of `"Failed to fetch nonce"` errors is a backend that strictly parses one address format and rejects the others. Gala Wallet may send the address as `eth|<EIP55>`, as a raw `client|<id>` identity, as `0x<addr>`, or as bare hex — depending on the user, the wallet build, and whether `eth_requestAccounts` or the GalaChain identity API was used.

The `/auth/nonce` endpoint (and any other endpoint that takes a wallet address as input) **must** accept all four formats and normalize internally. A minimal robust parser:

```ts
type ParsedAddr =
  | { kind: 'eth'; eth: `0x${string}`; gala: `eth|${string}` }
  | { kind: 'client'; gala: `client|${string}` };

function parseWalletAddress(input: string): ParsedAddr {
  const raw = input.trim();

  // client| identity — pass through, never convert to eth|
  if (raw.startsWith('client|')) {
    const id = raw.slice(7);
    if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error('invalid client| id');
    return { kind: 'client', gala: `client|${id.toLowerCase()}` };
  }

  // eth| — strip the GalaChain prefix, then treat as ETH
  let hex = raw.startsWith('eth|') ? raw.slice(4) : raw;

  // 0x<hex> or bare 40-char hex — normalize
  if (hex.startsWith('0x') || hex.startsWith('0X')) hex = hex.slice(2);
  if (!/^[a-f0-9]{40}$/i.test(hex)) throw new Error('invalid ETH address');

  const eth = ('0x' + toEIP55(hex)) as `0x${string}`;
  return { kind: 'eth', eth, gala: `eth|${eth.slice(2)}` };
}
```

Key rules the parser enforces:

- Sanitize `eth|` and `0x` prefixes idempotently — never double-add or double-strip.
- Validate `client|` IDs as 24-char hex (MongoDB ObjectId), lowercase them.
- EIP-55 checksum the ETH form before storing or returning.
- Throw a typed error on garbage input — do not silently fall through, or you get the same "looks valid but recovers wrong address" failure as the nonce hashing mismatch.

**Nonce storage key:** key the nonce by the *normalized* form (`0x<EIP55>` for ETH wallets, `client|<id>` for native Gala identities), not the raw input. Otherwise the same user gets a different nonce row depending on which casing/prefix variant the client happened to send.

**Client call (both wallets):**
```js
// Gala Wallet returns eth| format — normalize to 0x before calling personal_sign
const signingAddr = address.startsWith('eth|') ? '0x' + address.slice(4) : address;
const signature = await provider.request({
  method: 'personal_sign',
  params: [nonce, signingAddr],
})
// returns: "0xabc123..."  (plain hex, same format for both MetaMask and Gala Wallet)
```

### Server-side message hashing

Both wallets use **EIP-191** (`personal_sign`) for nonce login. The server hash is identical for both:

```
hash = keccak256( "\x19Ethereum Signed Message:\n" + len(msg) + msg )
```

In practice: `ethers.hashMessage(nonce)` (ethers.js v6).

> **Note:** The `keccak256("0x" + hex(msg))` scheme described in earlier versions of this doc applies to GalaChain **chaincode** signature verification, not to the browser extension's `personal_sign` implementation. Using the wrong hash for `personal_sign` recovery produces a silent mismatch — the signature looks valid but the recovered address is wrong.

---

## 6. Signature Types

### EIP-191 — MetaMask (`personal_sign`)

```
hash = keccak256("\x19Ethereum Signed Message:\n" + len(message) + message)
signature = 65 bytes: r[32] || s[32] || v[1]
encoded as: "0x" + r + s + v   (130 hex chars total)
```

### EIP-712 — Gala Wallet payment DTOs only (`signTypedData_v4`)

Used for signing payment DTOs (e.g. TransferToken), **not** for nonce login.

```json
{
  "signature": "0x...",
  "types": { "EIP712Domain": [], "Transfer": [] },
  "domain": { "name": "...", "version": "..." },
  "primaryType": "Transfer",
  "message": { }
}
```

GalaChain reconstructs the typed-data hash server-side from `types`, `domain`, and `message`. **Do not add an EIP-191 prefix when verifying** — it will produce the wrong hash.

### Server-to-chain DTO signing (e.g. MintToken, TransferToken)

For server-initiated GalaChain calls:

1. **Strip** `signature`, `multisig`, `trace`, and `prefix` fields from the DTO before signing.
2. **Deterministic JSON**: recursively sort all object keys, no whitespace. Standard `JSON.stringify` / `json.Marshal` are **not** deterministic — you must sort keys explicitly.
3. Hash: `keccak256(deterministicJSON)`
4. secp256k1 sign
5. **Low-S normalization**: if `s > n/2`, set `s = n - s` and flip parity `v`. GalaChain **rejects** high-S signatures.
6. Encode as 130-char hex: `r[32] || s[32] || v[1]` (no `0x` prefix in the signature field value).

---

## 7. Session Management

Session management after nonce verification is up to the implementation (JWT, opaque tokens, cookies, etc.).

If using JWT, a minimal proposal:

```json
{
  "id": "<stable-user-id>",
  "walletAddress": "0x<verified-address>"
}
```

The key constraint regardless of session strategy: `walletAddress` must come from the **verified** nonce flow, never from user input.

---

## 8. GalaChain API Call Patterns

### Channel endpoints (relative to `GALACHAIN_GATEWAY`)

```
/api/asset/token-contract          asset channel (GALA, global items)
/api/<game>/token-contract         game-specific channel
/api/asset/public-key-contract     identity and alias lookups (requires GALACHAIN_GATEWAY env var)
```

### Gateway HMAC auth (if required)

```
signature = HMAC-SHA256(secret, timestamp + "\n" + method + "\n" + path + "\n" + sha256(body))
Headers:
  X-Api-Key:   <key-id>
  X-Timestamp: <unix-seconds>
  X-Signature: <hmac-hex>
```

### TransferToken DTO (client-signed payment)

1. Server builds unsigned DTO: `{ "from": "eth|...", "to": "eth|...", "tokenInstances": [...], "quantity": "..." }`
2. Normalize `from`/`to` to `eth|<EIP55>` or `client|` format.
3. Client signs via MetaMask (`personal_sign`) or Gala Wallet (`signTypedData_v4`).
4. Server reassembles: unsigned DTO + client signature + optional EIP-191 prefix (MetaMask only).
5. Submit to GalaChain chaincode.

---

## 9. EVM vs GalaChain Payments

When supporting both Ethereum/Polygon payments (USDC, USDT) alongside native GalaChain tokens (GALA, GUSDC, GUSDT):

| Property | GalaChain | EVM (ETH/Polygon) |
|----------|-----------|-------------------|
| Payment verification | Client-signed TransferToken DTO -> chaincode | On-chain ERC-20 Transfer event + block confirmations |
| NFT minting | Yes, in same flow | No — funds only reach reward wallet; mint is separate |
| Confirmation | Synchronous | Async — requires confirmation poller |
| Signature | EIP-191 or EIP-712 JSON | EVM transaction hash (`0x...`) |

**EVM confirmation pattern:**
1. Client submits ERC-20 transfer on-chain, gets a `txHash`.
2. Server verifies the receipt: ERC-20 Transfer log present, correct contract, correct recipient, amount >= expected.
3. If receipt is `null` (tx still in mempool) **or** block confirmations are insufficient -> park with status `"processing"`, save `txHash`, return `ErrEvmAwaitingConfirmation` (`TxBlock: -1` when still pending in mempool).
4. Background poller (every ~15 s) retries: `eth_getTransactionReceipt(txHash)` -> once confirmed, re-queues for minting.
5. Hard failures: receipt `status != "0x1"` (reverted) or receipt disappears (chain re-org) -> mark failed.

**DEX integration with EVM payments:**
- The DEX step runs only when the purchase includes NFT line items.
- For EVM-paid NFT purchases, the DEX step is entered but the reward-wallet -> DEX-system-wallet transfer sub-step is skipped (EVM funds are on Ethereum, not GalaChain).
- Game-item-only bundles always skip the DEX step regardless of payment method.

**Address format at EVM provider initialization:**
- The reward wallet address is typically stored as `eth|<addr>` in environment/config.
- EVM JSON-RPC calls require standard `0x<addr>` format — convert explicitly at initialization: strip `eth|` prefix and prepend `0x`. Failure to do this causes silent address mismatch in Transfer log validation.

---

## 10. Caveats and Gotchas

1. **EIP-55 checksum is mandatory.** GalaChain public-key-contract lookup fails silently with unchecksummed addresses.

2. **Nonce hashing mismatch.** Gala Wallet hex-encodes the message before hashing; MetaMask does not. Getting this wrong causes silent verification failure — the signature looks valid but the recovered address is wrong.

3. **Low-S normalization.** GalaChain rejects secp256k1 signatures where `s > n/2`. Always normalize before submitting server-signed DTOs.

4. **Alias resolution is non-fatal.** Many ETH wallets have no registered GalaChain alias. Always fall back to `eth|<addr>`.

5. **`client|` vs `eth|` for minting.** Prefer `client|` when available. Using `eth|` for a user who has a `client|` identity credits the wrong on-chain account.

6. **Deterministic JSON is not the default.** Standard library JSON serializers do not guarantee key order. Implement recursive key sorting explicitly for anything that gets signed.

7. **One-time nonces.** Invalidate immediately after successful verification. A reused nonce is a replay attack vector.

8. **`eth|` has no `0x`.** `eth|A1b2C3...` not `eth|0xA1b2C3...`. Easy to double-add the prefix when converting from `0x` format.

9. **EIP-712 — no EIP-191 prefix.** When verifying a Gala Wallet EIP-712 signature, GalaChain reconstructs the hash from `types`/`domain`/`message`. Adding an EIP-191 prefix produces the wrong hash.

10. **EVM payments do not mint.** EVM transactions transfer funds only. NFT minting always happens on GalaChain, in a separate step, after EVM payment confirmation.

11. **EVM reward wallet address needs `0x`, not `eth|`.** Wallet addresses in config are often stored as `eth|<addr>`. EVM JSON-RPC calls (receipt log comparison) require `0x<addr>`. Convert at the boundary — otherwise the `to` address in the Transfer log never matches and every EVM payment silently fails validation.

12. **EVM pending-mempool transactions are not errors.** A `null` receipt from `eth_getTransactionReceipt` means the tx is still in the mempool — not that it failed. Park it with the same confirmation-poller flow used for under-confirmed transactions (`TxBlock: -1` signals this case). Only a reverted receipt (`status != "0x1"`) or a truly absent receipt (re-org) is a hard failure.

13. **`/auth/nonce` must accept all four address formats.** "Failed to fetch nonce" almost always means the backend rejected the input format. Gala Wallet may hand you `client|<id>`, `eth|<addr>`, `0x<addr>`, or bare hex. Always run input through a single normalizer (see §5) before any validation, lookup, or nonce-keying logic. A regex like `/^0x[a-f0-9]{40}$/i` at the route boundary will lock out every Gala Wallet user.
