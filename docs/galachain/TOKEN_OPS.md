# GalaChain Token Operations

Instructions for building token minting, burning, transferring, and allowance workflows on GalaChain.

## Gateway

All operations are `POST {gatewayUrl}/{MethodName}` with JSON body. Response: `{ Status: 1, Data: T }` on success, `{ Status: 0, Message: "..." }` on failure.

| Network | Gateway URL |
|---------|-------------|
| Mainnet | `https://gateway-mainnet.galachain.com/api/asset/token-contract` |
| Testnet | `https://gateway-testnet.galachain.com/api/asset/token-contract` |

> The bootstrap doc previously listed an older testnet path
> (`/api/testnet01/gc-<hash>-GalaChainToken`) — that URL now 404s.
> Both networks use the same `/api/asset/token-contract` layout; only
> the host differs.

## Token Identification

Every token uses a 4-part composite key:

```
collection | category | type | additionalKey
```

Examples:
- Fungible: `GALA|Unit|none|none`
- NFT: `BirdsOfPrey|Hawk|Harris|Rare`

Addresses use `eth|` prefix (not `0x`): `eth|4e0CD6A94a839F3D9a6F21013A4B0b8E1C8A51ee`

## Two Signing Contexts

### Browser (MetaMask)

Uses `@gala-chain/connect` BrowserConnectClient with EIP-191 personal_sign. **Required override** — the SDK v2.x has bugs in its sign method:

```typescript
import { BrowserConnectClient } from '@gala-chain/connect'
import { signatures } from '@gala-chain/api'

const client = new BrowserConnectClient()
;(client as any).sign = async (_method: string, payload: Record<string, unknown>) => {
  const data = signatures.getPayloadToSign(payload as object)
  const prefix = `Ethereum Signed Message:\n${data.length}`
  const signature = await client.signMessage(data)
  return { ...payload, prefix, signature }
}
```

Without this override, all operations fail with `MISSING_SIGNER`. The bugs: (1) `calculatePersonalSignPrefix` converges on wrong length, (2) default SIGN_TYPED_DATA adds `domain`/`types` fields triggering EIP-712 instead of personal_sign.

Pattern for browser-signed write operations:

```typescript
async function signAndPost(client, method, dto) {
  const signedDto = await client.sign(method, dto)
  const response = await fetch(`${gatewayUrl}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signedDto),
  })
  const result = await response.json()
  if (result.Status !== 1) throw new Error(result.Message)
  return result.Data
}
```

### Server (Private Key)

Uses `@gala-chain/api` SDK's `createValidSubmitDTO().signed(privateKey)`. This handles DTO validation, `uniqueKey` generation, `signerPublicKey`, and signature automatically:

```typescript
import { createValidSubmitDTO, MintTokenDto } from '@gala-chain/api'
import BigNumber from 'bignumber.js'

const signedDto = await createValidSubmitDTO(MintTokenDto, {
  tokenClass: { collection: 'MyGame', category: 'Weapon', type: 'Sword', additionalKey: 'Rare' },
  owner: 'eth|...' as any,
  quantity: new BigNumber('1'),
}).signed(PRIVATE_KEY)

await fetch(`${gatewayUrl}/MintToken`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(signedDto),
})
```

Available DTO classes: `MintTokenDto`, `MintTokenWithAllowanceDto`, `TransferTokenDto`, `BurnTokensDto`, `GrantAllowanceDto`.

## DTO Construction Rules

**Browser DTOs (plain objects):**
- All numeric values MUST be strings (`'10'`), never BigNumber instances. `instanceToPlain(BigNumber)` produces `{c,e,s}` instead of `"10"`, causing hash mismatches.
- Every write DTO needs a `uniqueKey` (random base64 string, 32 bytes) to prevent replay attacks.
- `maxSupply` must be a finite positive number or omitted entirely. Never pass `Infinity`.

**Server DTOs (via `createValidSubmitDTO`):**
- Use `BigNumber` instances for numeric fields (the SDK handles serialization correctly).
- `uniqueKey` is auto-generated if not provided.

## Read Operations (Unsigned)

No wallet or signing required. POST with a plain JSON body.

### FetchBalances

```json
{ "owner": "eth|..." }
```
Returns: `TokenBalance[]`

### FetchBalancesWithTokenMetadata

```json
{ "owner": "eth|..." }
```
Returns: `{ results: TokenBalanceWithMetadata[] }` — includes token class metadata (name, symbol, image, decimals).

### FetchTokenClassesWithPagination

```json
{ "collection": "MyGame", "category": "optional", "limit": 100 }
```
Returns: `{ results: TokenClass[], nextPageBookmark: "" }`

Fields follow hierarchical constraints: provide `collection` before `category`, `category` before `type`.

**Pagination gotcha:** Omit `bookmark` entirely on the first page. The gateway rejects empty-string bookmarks with `DTO_VALIDATION_FAILED: bookmark should not be empty`. On subsequent pages, pass the `nextPageBookmark` value from the previous response.

### FetchNftCollectionAuthorizationsWithPagination

```json
{ "limit": 100 }
```
Returns: `{ results: [{ collection, authorizedUsers }], nextPageBookmark }`

## Write Operations — Browser Signed

All require MetaMask signing via the overridden `client.sign(method, dto)`.

### TransferToken

```typescript
const dto = {
  from: 'eth|sender',
  to: 'eth|recipient',
  tokenInstance: {
    collection: 'GALA',
    category: 'Unit',
    type: 'none',
    additionalKey: 'none',
    instance: '0',  // '0' for fungible tokens
  },
  quantity: '100',
  uniqueKey: generateUniqueKey(),
}
```

### MintTokenWithAllowance

Grants allowance to self and mints atomically. Caller must be a token authority.

```typescript
const dto = {
  tokenClass: { collection: 'MyGame', category: 'Weapon', type: 'Sword', additionalKey: 'Rare' },
  tokenInstance: '0',
  owner: 'eth|recipient',
  quantity: '1',
  uniqueKey: generateUniqueKey(),
}
```

### BurnTokens

```typescript
const dto = {
  tokenInstances: [{
    tokenInstanceKey: {
      collection: 'MyGame',
      category: 'Weapon',
      type: 'Sword',
      additionalKey: 'Rare',
      instance: '0',
    },
    quantity: '1',
  }],
  uniqueKey: generateUniqueKey(),
}
```

### GrantAllowance

Grants permission for another address to perform operations on your tokens.

```typescript
const dto = {
  tokenInstance: {
    collection: 'MyGame',
    category: 'Weapon',
    type: 'Sword',
    additionalKey: 'Rare',
    instance: '0',
  },
  quantities: [{
    user: 'eth|grantee',    // who receives the allowance
    quantity: '100',         // how many tokens they can act on
  }],
  allowanceType: 4,          // 1=Lock, 2=Unlock, 3=Burn, 4=Mint
  uses: '100',               // number of times allowance can be used (MUST be > 0)
  uniqueKey: generateUniqueKey(),
}
```

**Critical:** `uses` must be a positive integer. `BigNumber(0).isPositive()` returns `false` — the SDK rejects `uses: '0'`. Set `uses` to at least the expected number of operations.

### GrantNftCollectionAuthorization

Claims a collection name (step 1 of NFT collection creation):

```typescript
const dto = {
  collection: 'MyGame',
  authorizedUser: 'eth|creator',
  uniqueKey: generateUniqueKey(),
}
```

### CreateNftCollection

Creates a token class from a claimed authorization (step 2):

```typescript
const dto = {
  collection: 'MyGame',
  category: 'Weapon',
  type: 'Sword',
  additionalKey: 'Rare',
  name: 'Rare Sword',
  symbol: 'RS',
  description: 'A rare sword',
  image: 'https://example.com/sword.png',
  uniqueKey: generateUniqueKey(),
  // Optional:
  maxSupply: '1000',    // omit for unlimited (never pass Infinity)
  rarity: 'Rare',
}
```

### CreateTokenClass

Alternative to CreateNftCollection (does not require prior authorization):

```typescript
const dto = {
  tokenClass: { collection: 'MyGame', category: 'Weapon', type: 'Sword', additionalKey: 'Rare' },
  name: 'Rare Sword',
  symbol: 'RS',
  description: 'A rare sword',
  image: 'https://example.com/sword.png',
  isNonFungible: true,
  decimals: 0,
  uniqueKey: generateUniqueKey(),
}
```

## Write Operations — Server Signed

Use `createValidSubmitDTO(DtoClass, fields).signed(privateKey)` then POST the result.

### MintToken

Mints using a pre-existing allowance. The signer must have been granted a Mint allowance by the token authority.

```typescript
const signedDto = await createValidSubmitDTO(MintTokenDto, {
  tokenClass: { collection, category, type, additionalKey },
  owner: 'eth|recipient' as any,
  quantity: new BigNumber('1'),
}).signed(PRIVATE_KEY)
// POST to MintToken
```

### MintTokenWithAllowance

Grants allowance to self and mints atomically. The signer must be a token authority.

```typescript
const signedDto = await createValidSubmitDTO(MintTokenWithAllowanceDto, {
  tokenClass: { collection, category, type, additionalKey },
  tokenInstance: new BigNumber(0),
  owner: 'eth|recipient' as any,
  quantity: new BigNumber('1'),
}).signed(PRIVATE_KEY)
// POST to MintTokenWithAllowance
```

### TransferToken

```typescript
const signedDto = await createValidSubmitDTO(TransferTokenDto, {
  from: 'eth|sender' as any,
  to: 'eth|recipient' as any,
  tokenInstance: { collection, category, type, additionalKey, instance: new BigNumber(0) } as any,
  quantity: new BigNumber('100'),
}).signed(PRIVATE_KEY)
// POST to TransferToken
```

## AllowanceType Enum

| Value | Type | Description |
|-------|------|-------------|
| 1 | Lock | Permission to lock tokens |
| 3 | Burn | Permission to burn tokens |
| 4 | Mint | Permission to mint tokens |

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `MISSING_SIGNER` | Sign override not applied, or BigNumber serialization mismatch | Apply the BrowserConnectClient sign override; use string values in DTOs |
| `INSUFFICIENT_MINT_ALLOWANCE` | Signer doesn't have mint allowance, or `uses` exhausted | Grant allowance with sufficient `uses` and `quantity` |
| `TOTAL_SUPPLY_EXCEEDED` | Mint quantity exceeds token class maxSupply | Check remaining supply before minting |
| `OBJECT_NOT_FOUND` | Token class doesn't exist on-chain | Verify class was created via CreateTokenClass/CreateNftCollection |
| `DTO_VALIDATION_FAILED` | Invalid field values (wrong address format, non-positive uses, etc.) | Check address checksumming (`eth|` + checksummed hex), ensure `uses > 0` |
| `BigNumberIsNotInfinity` | `maxSupply` set to Infinity | Omit `maxSupply` for unlimited, or pass a finite number |
| `USER_REJECTED` | User denied MetaMask popup | Prompt user to approve |

## NFT Collection Creation Flow

Two-step process:

1. **Claim collection name:** `GrantNftCollectionAuthorization` — reserves the collection name
2. **Create token class:** `CreateNftCollection` — creates the actual token class with metadata

Each unique `collection|category|type|additionalKey` combination is a separate token class (NFT type). A single collection can have many classes.

## Purchase Pattern (Server-Mediated)

For apps where users pay tokens to receive NFTs:

1. **Frontend:** Buyer signs `TransferToken` DTO (payment to app wallet) via MetaMask
2. **Frontend:** Sends signed DTO to your backend (NOT directly to GalaChain)
3. **Backend:** Validates DTO fields (recipient, amount), submits to GalaChain
4. **Backend:** On payment success, mints NFT to buyer using `MintTokenWithAllowance` (if app wallet is authority) or `MintToken` (if app wallet has pre-granted allowance)
5. **Backend:** Returns minted instance details to frontend

The backend controls submission, so payment verification is inherent (`Status: 1` = success). Pass `gatewayUrl` from frontend to backend to ensure both use the same network.
