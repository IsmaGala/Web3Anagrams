# Gala DEX Integration Reference

Language-agnostic reference for interacting with the Gala DeFi DEX (swap.gala.com). Covers authentication, pool queries, liquidity management, swapping, and fee collection.

---

## Infrastructure

| Component | Default URL |
|---|---|
| DEX API | `https://dex-backend-prod1.defi.gala.com` |
| Bundle API | `https://bundle-backend-prod1.defi.gala.com` |

**Two-API pattern:** every write operation has two steps:
1. Build the payload (locally, or via DEX API for swaps).
2. Sign it and POST it to the Bundle API.

The DEX API is read-only except for the swap payload generation endpoint.

---

## Tokens & Pool Constants

### Token class key

Every token in GalaChain is identified by a class key object:

```json
{
  "collection":    "GALA",
  "category":      "Unit",
  "type":          "none",
  "additionalKey": "none"
}
```

Replace `"GALA"` with `"GUSDC"` for the other token. All supported tokens use `Unit / none / none`.

### Token key string

Used in pool IDs and balance keys:

```
GALA  -> "GALA$Unit$none$none"
GUSDC -> "GUSDC$Unit$none$none"
```

### Fixed pool parameters

The GALA/GUSDC pool operates with these fixed parameters:

| Parameter | Value |
|---|---|
| token0 | GALA |
| token1 | GUSDC |
| Fee tier | `10000` (1%) |
| Tick lower | `-887200` (full range) |
| Tick upper | `887200` (full range) |
| Slippage for add/remove | `0.5%` |
| Slippage for swaps | `5%` applied to `sqrtPrice` |

### Pool ID string

```
$pool$GUSDC$Unit$none$none$GALA$Unit$none$none$10000
```

> **Token order matters:** token0 = GALA, token1 = GUSDC. `amount0` always refers to GALA, `amount1` to GUSDC throughout all operations.

---

## Wallet Address Derivation

GalaChain uses an Ethereum-derived address format: `eth|<address>`.

```
secp256k1 private key (32 bytes)
  -> uncompressed public key (65 bytes, 0x04 prefix)
  -> keccak256(pubkey[1:])       <- hash the 64 bytes after the 0x04 prefix
  -> last 20 bytes               <- Ethereum address
  -> lowercase hex, no 0x prefix
  -> prepend "eth|"

Result: "eth|a1b2c3d4e5f6..."
```

**Accepted private key formats:**
- Hex without prefix: `a1b2c3...` (61-66 chars; odd-length gets a leading `0` prepended)
- Hex with `0x` prefix: `0xa1b2c3...`
- Base64: `aAbBcC...==` (44 chars, decodes to 32 bytes)

---

## Signing Payloads

All write operations require a cryptographic signature attached to the payload.

### Algorithm

```
1. Serialize the payload using deterministic JSON (see next section)
2. Hash: keccak256(serialized_bytes)
3. Sign: secp256k1 ECDSA over the hash
4. Adjust v byte: if sig[64] < 27, add 27  <- Ethereum-style (27 or 28)
5. Encode: hex(signature)                   <- 65 bytes -> 130 hex chars
6. Add to payload: { ...payload, "signature": "<hex>" }
```

> The v-byte adjustment (step 4) is critical. GalaChain's `@gala-chain/api` uses Ethereum-style recovery (`v = 27|28`). Most crypto libraries produce `v = 0|1` by default — you must add 27 manually.

### Signature field

The `signature` field is always merged into the top-level payload object before submission:

```json
{
  "fee": 10000,
  "owner": "eth|...",
  "signature": "a1b2c3...f6"
}
```

---

## Deterministic JSON Serialization

The payload must be serialized with **sorted object keys** and **no whitespace** before hashing. This matches the behavior of the npm package `json-stringify-deterministic`.

Rules:
- Object keys sorted lexicographically (recursive — applies to nested objects too).
- No spaces, no newlines.
- `null` for null/nil values.
- Numbers: integers as-is; floats with no trailing zeros (e.g. `1.5` not `1.50`).
- Empty-value fields are omitted from objects.
- Arrays preserve insertion order.

**Example:**

Input:
```json
{ "fee": 10000, "owner": "eth|abc", "token0": { "collection": "GALA", "category": "Unit" } }
```

Deterministic form (what gets hashed):
```
{"fee":10000,"owner":"eth|abc","token0":{"category":"Unit","collection":"GALA"}}
```

Note `category` comes before `collection` alphabetically.

---

## DEX API Endpoints

Base URL: `https://dex-backend-prod1.defi.gala.com`

### Get Pool State

```
GET /v1/trade/pool?token0={token0}&token1={token1}&fee={fee}
```

| Parameter | Value |
|---|---|
| `token0` | `GALA$Unit$none$none` (URL-encoded) |
| `token1` | `GUSDC$Unit$none$none` (URL-encoded) |
| `fee` | `10000` |

**Response:**
```json
{
  "data": {
    "Status": 1,
    "Data": {
      "sqrtPrice": "1.234567890123456789",
      "liquidity": "...",
      "tick": "..."
    }
  }
}
```

The key field is `data.Data.sqrtPrice`. It is used in all liquidity math and swap slippage calculations.

---

### Get Position Fees

```
GET /v1/trade/position
  ?token0={token0}
  &token1={token1}
  &fee={fee}
  &tickLower={tickLower}
  &tickUpper={tickUpper}
  &owner={walletAddress}
  &positionId={positionId}
```

**Response:**
```json
{
  "data": {
    "Data": {
      "tokensOwed0": "12.34500000",
      "tokensOwed1": "0.56789000"
    }
  }
}
```

- `tokensOwed0` — GALA fees accrued
- `tokensOwed1` — GUSDC fees accrued

---

### Get Transaction Status

```
GET /v1/trade/transaction-status?id={txID}
```

**Response:**
```json
{
  "data": {
    "status": "SUCCESS",
    "batch": {
      "error": ""
    }
  }
}
```

See Transaction Confirmation section for status values and polling logic.

---

### Generate Swap Payload

```
POST /v1/trade/swap
Content-Type: application/json
```

**Request body:**
```json
{
  "tokenIn":          { "collection": "GALA",  "category": "Unit", "type": "none", "additionalKey": "none" },
  "tokenOut":         { "collection": "GUSDC", "category": "Unit", "type": "none", "additionalKey": "none" },
  "fee":              10000,
  "amountIn":         "100.0",
  "amountInMaximum":  "100.0",
  "amountOutMinimum": "-0.000001",
  "sqrtPriceLimit":   "<computed — see Swap section>"
}
```

**Response:**
```json
{
  "data": { "<unsigned swap DTO — sign this and submit to Bundle API>" }
}
```

The `data` object is the unsigned DTO. Do not modify it — sign it as-is and submit to the Bundle API.

---

## Bundle API — Submitting Transactions

Base URL: `https://bundle-backend-prod1.defi.gala.com`

```
POST /bundle
Content-Type: application/json
```

**Request body:**
```json
{
  "method":              "<operation name>",
  "signedDto":           { "<signed payload>" },
  "stringsInstructions": [ "<lock key 1>", "<lock key 2>" ]
}
```

| Field | Description |
|---|---|
| `method` | One of: `AddLiquidity`, `RemoveLiquidity`, `Swap`, `CollectPositionFees` |
| `signedDto` | The payload object with the `signature` field merged in |
| `stringsInstructions` | On-chain optimistic concurrency lock keys (pool ID + balance keys for all involved parties) |

**Success response:**
```json
{
  "data": {
    "data": {
      "data": "<txID>"
    }
  }
}
```

The transaction ID is at `data.data.data` (three levels deep).

**Error response:**
```json
{ "message": "error description" }
```

---

## Operations

### Add Liquidity

Deposits GALA and GUSDC into the pool. You specify the GUSDC amount; the required GALA amount is computed from pool math.

**Step 1 — compute amounts from current sqrtPrice:**
```
amount0 (GALA)  = f(gusdcAmount, sqrtPrice, tickLower, tickUpper)
amount1 (GUSDC) = gusdcAmount
liquidity       = L
```

**Step 2 — build and sign payload:**
```json
{
  "token0":         { "collection": "GALA",  "category": "Unit", "type": "none", "additionalKey": "none" },
  "token1":         { "collection": "GUSDC", "category": "Unit", "type": "none", "additionalKey": "none" },
  "fee":            10000,
  "owner":          "eth|<your_wallet>",
  "tickLower":      -887200,
  "tickUpper":      887200,
  "amount0Desired": "<gala_amount>",
  "amount1Desired": "<gusdc_amount>",
  "amount0Min":     "<gala_amount x 0.995>",
  "amount1Min":     "<gusdc_amount x 0.995>",
  "positionId":     "<your_position_id>",
  "uniqueKey":      "galaswap - operation - <uuid-v4>"
}
```

**Step 3 — submit to Bundle API** with the `AddLiquidity` method and the lock keys for the pool, the user's position, and both user-side and pool-side token balances.

Returns a `txID` in `PENDING` state. Poll `/v1/trade/transaction-status` to confirm.

---

### Remove Liquidity

Withdraws GALA and GUSDC from the pool by burning liquidity units.

```json
{
  "token0":     { "collection": "GALA",  "category": "Unit", "type": "none", "additionalKey": "none" },
  "token1":     { "collection": "GUSDC", "category": "Unit", "type": "none", "additionalKey": "none" },
  "fee":        10000,
  "owner":      "eth|<your_wallet>",
  "tickLower":  -887200,
  "tickUpper":  887200,
  "amount":     "<liquidity_units_as_integer>",
  "amount0Min": "0",
  "amount1Min": "0",
  "positionId": "<your_position_id>",
  "uniqueKey":  "galaswap - operation - <uuid-v4>"
}
```

> `amount` must be an **integer string** (floor the liquidity decimal before submitting). `amount0Min` and `amount1Min` can both be `"0"` — no minimum is enforced on withdrawal.

---

### Swap (exact-input)

Two-step process:

**Step 1 — compute `sqrtPriceLimit`** from pool's current `sqrtPrice`:

```
Selling GALA  (tokenIn=GALA):  sqrtPriceLimit = sqrtPrice x (1 - 0.05)
Selling GUSDC (tokenIn=GUSDC): sqrtPriceLimit = sqrtPrice x (1 + 0.05)
```

**Step 2 — request unsigned DTO from DEX API** (`POST /v1/trade/swap`).

**Step 3 — sign the DTO and submit to Bundle API** with the `Swap` method.

> Unlike add/remove, **swap should be waited on synchronously** before proceeding with dependent operations (e.g. adding liquidity with the swapped tokens).

---

### Collect Position Fees

```json
{
  "token0":           { "collection": "GALA",  "category": "Unit", "type": "none", "additionalKey": "none" },
  "token1":           { "collection": "GUSDC", "category": "Unit", "type": "none", "additionalKey": "none" },
  "fee":              10000,
  "tickLower":        -887200,
  "tickUpper":        887200,
  "amount0Requested": "<tokensOwed0>",
  "amount1Requested": "<tokensOwed1>",
  "positionId":       "<your_position_id>",
  "uniqueKey":        "galaswap - operation - <uuid-v4>"
}
```

> If one side is zero, use `"0.00000001"` as a floor instead of `"0"` — submitting zero is rejected. If both are zero, skip the operation entirely.

---

## Transaction Confirmation

Poll until the status is terminal:

```
GET /v1/trade/transaction-status?id={txID}
```

| Status | Meaning | Terminal? |
|---|---|---|
| `SUCCESS` | Committed on-chain | Yes |
| `PROCESSED` | Also final (treat same as SUCCESS) | Yes |
| `FAILED` | Rejected on-chain (check `batch.error`) | Yes |
| `ERROR` | Infrastructure error | Yes |
| anything else | Still pending | No — keep polling |

**Recommended polling parameters:**
- Timeout: 120 seconds
- Poll interval: 5 seconds

---

## Uniswap v3 Liquidity Math

The GALA/GUSDC pool uses full-range ticks, so the sqrtPrice bounds are:

```
base            = 1.0001
sqrtPriceLower  = base ^ (tickLower / 2)   = 1.0001 ^ (-443600)
sqrtPriceUpper  = base ^ (tickUpper / 2)   = 1.0001 ^ (443600)
```

### Add Liquidity — given GUSDC input amount

```
L        = gusdcAmount / (sqrtPrice - sqrtPriceLower)
amount0  = L x (1/sqrtPrice - 1/sqrtPriceUpper)   -> GALA required
amount1  = gusdcAmount                              -> GUSDC you deposit
liquidity = L
```

### Remove Liquidity — given liquidity units

```
amount0 = L x (1/sqrtPrice - 1/sqrtPriceUpper)   -> GALA redeemable
amount1 = L x (sqrtPrice   - sqrtPriceLower)      -> GUSDC redeemable
```

Use arbitrary-precision decimal arithmetic (not float64) to avoid rounding errors.

---

## GALA Price from Pool

There is no dedicated price endpoint. Derive it from `sqrtPrice`:

```
price_GUSDC_per_GALA = sqrtPrice^2
```

Since token0 = GALA and token1 = GUSDC, squaring the sqrtPrice gives the GUSDC cost of 1 GALA.
