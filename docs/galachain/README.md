# GalaChain Integration Reference

Local copy of the GalaChain bootstrap docs from
<https://galachainbootstrap.replit.app/> — built by a teammate to consolidate
the painful parts of integrating with Gala Wallet, MetaMask, GalaChain
chaincode, and the Gala DEX.

These files are saved here so the WordChain project always has the reference
available without depending on the live site.

## Files

| File | What it covers |
|---|---|
| `WALLET_AUTH.md` | Wallet auth flow for Gala Wallet + MetaMask: the four address formats, nonce login, EIP-191 vs EIP-712 signing, alias resolution, EVM payment confirmation. **Read this first.** |
| `TOKEN_OPS.md` | Mint / transfer / burn / allowance on GalaChain. Browser-side `@gala-chain/connect` sign override, server-side `createValidSubmitDTO`, DTO rules, common errors. |
| `gala-dex.md` | Gala DEX (swap.gala.com) — pool queries, add/remove liquidity, swap, fee collection. Uniswap v3 math, deterministic JSON, v-byte adjustment. |
| `DASHBOARD.md` | Pattern for a single-file React dashboard with Recharts (their reference dashboard). |
| `DATA-PIPELINE.md` | Express proxy pattern + the multi-channel balance fan-out for showing a user's full NFT/token inventory. |
| `STACK.md` | Stack used in their reference dashboard (React 19, Vite, Express proxy, Cloud Run). |
| `DEPLOY.md` | Cloud Run deploy recipe. |

## Most relevant pieces for WordChain

WordChain is a word-game web app where players will presumably earn / mint /
trade word-NFTs. From the docs above, the load-bearing patterns are:

1. **Address normalization** (`WALLET_AUTH.md` §1, §5). Any backend endpoint
   that accepts a wallet address MUST handle all four formats
   (`0x...`, `eth|...`, `client|...`, bare hex) and EIP-55 checksum before
   doing anything else. A regex-strict route is the #1 cause of
   "Failed to fetch nonce".

2. **Nonce login flow** (`WALLET_AUTH.md` §5). Both wallets use
   `personal_sign` (EIP-191) for login. Server hash =
   `keccak256("\x19Ethereum Signed Message:\n" + len(msg) + msg)`.
   In ethers v6 that's just `ethers.hashMessage(nonce)`.

3. **The `@gala-chain/connect` sign override** (`TOKEN_OPS.md` §"Browser").
   Without that 6-line override, every browser-signed write fails with
   `MISSING_SIGNER`. Drop it in once and forget about it.

4. **Purchase / mint pattern** (`TOKEN_OPS.md` § "Purchase Pattern").
   Frontend signs a `TransferToken` payment DTO → backend submits it →
   backend mints the NFT to the buyer with `MintTokenWithAllowance` or
   `MintToken`. This is the template for "user pays GALA, receives a
   word-NFT".

5. **Multi-channel balance fan-out** (`DATA-PIPELINE.md`). If WordChain ever
   shows a player's NFT inventory and you only query the `asset` channel,
   every per-game item will appear missing. Always `Promise.all` across the
   channel list and tag each balance with its channel.

6. **EVM payment fallback** (`WALLET_AUTH.md` §9). If we want to accept
   USDC/USDT on Ethereum or Polygon, the verification path is asynchronous:
   wait for receipt + confirmations, then mint separately on GalaChain.

## Live site

<https://galachainbootstrap.replit.app/> — all pages also served as raw markdown
(`/llms.txt` indexes them) so LLMs and crawlers can read them directly.
