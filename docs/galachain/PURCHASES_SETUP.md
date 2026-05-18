# Gem Store Purchases — Setup

Steps to bring the real GALA TransferToken flow online after pulling the
changeset that wired `api/store/purchase.ts` to the GalaChain gateway.

## 1. Install the new SDK

```sh
npm install
```

This pulls `@gala-chain/api`, used by `src/utils/galaChain.ts` for the
deterministic-JSON helper (`signatures.getPayloadToSign`). If
`getPayloadToSign` is missing on the installed version, pin a known-good
one (e.g. `@gala-chain/api@2.4.x`).

## 2. Set up a treasury wallet

This is the wallet that receives player GALA payments. Two options:

**A. Generate a fresh wallet for the game.** Recommended — keeps purchase
funds segregated from any other on-chain activity. Use MetaMask "Create
account" or any secp256k1 key generator. Note both forms:

- ETH form: `0x<addr>` (what MetaMask shows)
- Gala form: `eth|<EIP55-addr>` (what we configure)

Convert with one line of `ethers`:

```sh
node -e "const {getAddress}=require('ethers'); console.log('eth|' + getAddress('0xYOUR_ADDR').slice(2))"
```

**B. Reuse an existing GalaChain wallet** if you already have one
designated as a game treasury.

For testnet, fund the address with test GALA from the GalaChain testnet
faucet (your teammate likely knows where this is — otherwise the
`#galachain-dev` channel in Gala's Discord).

## 3. Set env vars

Both server (Vercel) AND client (Vite build) need the treasury address.
Vite-prefixed vars get baked into the bundle at build time, so they need
to live in the same env source as the regular Vercel vars.

### Vercel project env (Settings → Environment Variables)

| Key | Example | Notes |
|---|---|---|
| `GAME_TREASURY_ADDRESS` | `eth|3A1F...d4E5` | **Required.** Server validates `signedDto.to` against this. |
| `GALACHAIN_NETWORK` | `testnet` | `testnet` (default) or `mainnet`. |
| `GALACHAIN_GATEWAY_TESTNET` | _(unset)_ | Optional override. Defaults to the canonical testnet URL. |
| `GALACHAIN_GATEWAY_MAINNET` | _(unset)_ | Optional override. Defaults to the canonical mainnet URL. |
| `VITE_GAME_TREASURY_ADDRESS` | `eth|3A1F...d4E5` | **Required.** Same value as `GAME_TREASURY_ADDRESS`; baked into the client bundle. |
| `VITE_GALACHAIN_NETWORK` | `testnet` | Drives the TESTNET/MAINNET pill in the UI. |

### Local `.env.local`

Mirror the same keys for `vite dev` + `vercel dev`. (Add to `.gitignore`
if it isn't already — never commit treasury addresses you actually use.)

## 4. Sanity check before first purchase

In the running app:

1. Splash → CONNECT WALLET. Pick MetaMask or Gala Wallet.
2. Open Gem Store. The TESTNET pill should be visible.
3. Tap the GALA button on any pack. The wallet should pop with a
   `personal_sign` prompt showing the deterministic JSON of the
   TransferToken DTO.
4. Approve. Watch the Vercel function logs — you should see a POST to
   `/api/store/purchase` ending in 200, and the chain transfer confirming.
5. Gem count updates in the UI.

If step 3 fails with "TransferToken.to must be the game treasury", check
that `GAME_TREASURY_ADDRESS` and `VITE_GAME_TREASURY_ADDRESS` are
byte-identical (same casing, same EIP-55 checksum).

## 5. Known limitations of this milestone

- **GUSDC button is disabled.** The DTO shape is identical, only the
  `tokenInstance.collection` changes — short follow-up to wire it.
- **No reconciliation job.** If the on-chain TransferToken succeeds but
  the subsequent `grantGems` write fails, the player has paid without
  receiving gems. Auditable: `balance_transactions.metadata.uniqueKey`
  matches `signedDto.uniqueKey`, so an ops query can identify stuck
  payments. A scheduled reconciliation job is the right v3 follow-up.
- **No client|<id> support yet.** Players whose wallet returns a
  `client|<id>` identity (rare, but possible for some Gala Wallet
  builds) cannot log in. The auth endpoints surface a clear 400 telling
  them to use their underlying 0x address.

See `docs/galachain/WALLET_AUTH.md` §4 for the `GetPublicKey` lookup
that would close this gap.
