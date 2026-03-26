# Cove Trading MCP Server — Tool Reference

Server: `cove-trading` v0.1.0
Endpoint: `POST /mcp`
Auth: Bearer token (agent token — read-only or read-write)
Rate limit: 30 requests/minute per token
Transport: Streamable HTTP (SSE)

---

## Table of Contents

- [Authentication & Tokens](#authentication--tokens)
- [Token Permissions](#token-permissions)
- [Spending Limits](#spending-limits)
- [Webhook Callbacks](#webhook-callbacks)
- [Account & Portfolio](#account--portfolio)
- [Order Execution](#order-execution)
- [Limit Orders](#limit-orders)
- [Batch Orders](#batch-orders)
- [Token Search & Info](#token-search--info)
- [Market Scanning](#market-scanning)
- [Token Analytics](#token-analytics)
- [Wallet Analytics](#wallet-analytics)
- [Advanced](#advanced)
- [REST API — Token Management](#rest-api--token-management)

---

## Authentication & Tokens

Each account gets a **token pair** when created via `/agent` in Telegram or `POST /agent/tokens`:

- **Read-only token** (`permission: "read"`) — can call all read tools (balances, positions, token info, analytics). Cannot execute trades.
- **Read-write token** (`permission: "readwrite"`) — full access including order execution, limit orders, and cancellations.

Tokens are shown **once** at creation. The database stores a SHA-256 hash — the raw token cannot be recovered.

Creating new tokens for an account **automatically revokes** the previous pair.

### MCP Config

```json
{
  "cove-trading": {
    "url": "https://your-endpoint/api/mcp",
    "headers": {
      "Authorization": "Bearer <your-read-write-token>"
    }
  }
}
```

---

## Token Permissions

Write tools return an error when called with a read-only token:

```
"Read-only token cannot execute this action. Use a read-write token for trading operations."
```

**Write tools** (require read-write token):
`buy_token`, `sell_token`, `create_limit_buy`, `create_stop_loss`, `create_take_profit`, `create_trailing_stop`, `cancel_limit_order`, `simulate_swap`, `batch_order`

**Read tools** (work with any token):
All other tools (get_balance, get_positions, search_tokens, analytics, etc.)

---

## Spending Limits

Configurable per write token via Telegram `/agent` or `PATCH /agent/tokens/:id/limits`.

| Limit | Description |
|-------|-------------|
| `maxPerTradeUsd` | Maximum USD per single buy order |
| `maxHourlyUsd` | Maximum USD spent on buys in a rolling 1-hour window |
| `maxDailyUsd` | Maximum USD spent on buys in a rolling 24-hour window |

**Only buy operations are gated** — sells, stop-losses, take-profits, and trailing stops are never blocked by spending limits. Users must always be able to exit positions and set protection.

Limit buy orders (`create_limit_buy`) count toward spending limits at creation time, not trigger time.

Error format:
```
"Buy blocked: $100 exceeds per-trade limit of $50"
"Buy blocked: $100 would push hourly spend to $550 (limit: $500, used: $450)"
```

---

## Webhook Callbacks

Optional webhook URL on write tokens. Set via Telegram `/agent` or `PATCH /agent/tokens/:id/webhook`.

### Events

| Event | When |
|-------|------|
| `order_filled` | Market order completed successfully |
| `order_failed` | Order execution failed |
| `trade_reconciled` | Cross-chain trade reconciled with actual fill data |

### Delivery

- **Method:** `POST` to your webhook URL
- **Timeout:** 5 seconds
- **Retry:** None (fire-and-forget). Poll `get_order_status` as fallback.
- **Headers:**
  - `Content-Type: application/json`
  - `X-Cove-Signature` — `HMAC-SHA256(webhookSecret, body)`
  - `X-Cove-Event` — event type string

### Payload

```json
{
  "event": "order_filled",
  "orderId": "01JQXYZ...",
  "status": "success",
  "tokenSymbol": "BONK",
  "tokenAddress": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  "chainId": 1399811149,
  "side": "buy",
  "amountUsd": "100.00",
  "tokenAmount": "1234567.89",
  "priceUsd": "0.000081",
  "txHashes": ["5k2F..."],
  "timestamp": "2026-03-26T18:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | `order_filled`, `order_failed`, or `trade_reconciled` |
| `orderId` | string | Unique order ID (ULID) |
| `status` | string | Order status (`success`, `failed`, `cancelled`) |
| `tokenSymbol` | string | Token ticker (e.g. `BONK`) |
| `tokenAddress` | string | Token contract address |
| `chainId` | number | Blockchain network ID |
| `side` | string | `buy` or `sell` |
| `amountUsd` | string \| null | USD amount spent (buy) or received (sell) |
| `tokenAmount` | string \| null | Token amount bought or sold (human-readable) |
| `priceUsd` | string \| null | Price per token in USD at execution |
| `txHashes` | string[] | Transaction hashes (input + output) |
| `timestamp` | string | ISO 8601 timestamp |

### Verification (Node.js)

```javascript
const crypto = require("crypto")
const sig = crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
const valid = sig === headers["x-cove-signature"]
```

---

## Account & Portfolio

### `get_balance`

Get the available USDC balance (in USD) for trading.

**Parameters:** None

---

### `get_positions`

Get all open token positions with PnL for the connected account.

**Parameters:** None

**Returns:** Array of positions with `tokenSymbol`, `tokenAddress`, `chainId`, `balance`, `priceUsd`, `valueUsd`, `costBasisUsd`, `pnlPercent`, `pnlUsd`, `realizedPnl`, `unrealizedPnl`, `pnlIndicator`.

---

### `get_trading_history`

Get recent order history.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 20 | Orders to return (1-100) |
| `status` | string[] | No | all | Filter: `pending`, `claiming`, `executing`, `triggered`, `success`, `failed`, `cancelled`, `expired` |

---

### `get_order_status`

Check a specific order by ID. Ownership-checked.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | Yes | Order ID |

---

## Order Execution

### `buy_token`

Buy a token with USDC. Telegram notification on fill.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tokenAddress` | string | Yes | — | Token contract address |
| `chainId` | number | Yes | — | Chain ID (e.g. `1399811149` for Solana) |
| `amountUsd` | number | Yes | — | USD to spend (min: 1) |

Validates balance, fees, and spending limits before execution.

---

### `sell_token`

Sell a token position for USDC. Supports percentage or USD amount.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tokenAddress` | string | Yes | — | Token contract address |
| `chainId` | number | Yes | — | Chain ID |
| `percent` | number | No | — | Percentage of position to sell (1-100) |
| `amountUsd` | number | No | — | USD amount to sell (computed as % of position value) |

Provide either `percent` or `amountUsd`, not both. If neither, defaults to 100%.

---

### `simulate_swap`

Preview a swap without executing. Returns routing, output estimate, price impact, fees.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `side` | `"buy"` \| `"sell"` | Yes | Trade side |
| `tokenAddress` | string | Yes | Token contract address |
| `chainId` | number | Yes | Chain ID |
| `amountUsd` | number | Yes | USD amount (min: 1) |

---

## Limit Orders

### `get_limit_orders`

Get all active limit orders (limit buys, stop losses, take profits, trailing stops).

**Parameters:** None

---

### `create_limit_buy`

Limit buy that triggers on price movement or market cap target.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tokenAddress` | string | Yes | Token contract address |
| `chainId` | number | Yes | Chain ID |
| `triggerType` | `"pct_dip"` \| `"pct_rise"` \| `"mcap"` | Yes | Trigger condition |
| `triggerValue` | number | Yes | % for dip/rise, USD for mcap |
| `spendAmountUsd` | number | Yes | USD to spend when triggered (min: 1) |
| `expirySeconds` | number | No | 7 days | Order expires after N seconds (60-2592000) |

Counts toward spending limits at creation time.

---

### `create_stop_loss`

Sell when price drops by a percentage. Requires existing position.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tokenAddress` | string | Yes | — | Token contract address |
| `chainId` | number | Yes | — | Chain ID |
| `triggerPercent` | number | Yes | — | % drop to trigger (1-99) |
| `sellPercent` | number | No | 100 | % of position to sell (1-100) |
| `expirySeconds` | number | No | 7 days | Order expires after N seconds (60-2592000) |

---

### `create_take_profit`

Sell when price rises by a percentage. Requires existing position.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tokenAddress` | string | Yes | — | Token contract address |
| `chainId` | number | Yes | — | Chain ID |
| `triggerPercent` | number | Yes | — | % gain to trigger (min: 1) |
| `sellPercent` | number | No | 100 | % of position to sell (1-100) |
| `expirySeconds` | number | No | 7 days | Order expires after N seconds (60-2592000) |

---

### `create_trailing_stop`

Tracks the highest price since creation. Sells when price drops X% from peak. Requires existing position.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tokenAddress` | string | Yes | — | Token contract address |
| `chainId` | number | Yes | — | Chain ID |
| `triggerPercent` | number | Yes | — | % drop from peak to trigger (1-99) |
| `sellPercent` | number | No | 100 | % of position to sell (1-100) |
| `expirySeconds` | number | No | 7 days | Order expires after N seconds (60-2592000) |

The high-water mark is tracked in Redis and updates atomically across all instances. The stop price displayed on the order moves up as the token price rises.

---

### `cancel_limit_order`

Cancel an active limit order.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orderId` | string | Yes | Order ID to cancel |

---

## Batch Orders

### `batch_order`

Buy a token and set stop-loss and/or take-profit in one call. If the buy fails, nothing is created. If SL/TP fail after a successful buy, the buy still stands.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tokenAddress` | string | Yes | — | Token contract address |
| `chainId` | number | Yes | — | Chain ID |
| `amountUsd` | number | Yes | — | USD to spend on buy (min: 1) |
| `stopLoss` | object | No | — | `{ triggerPercent, sellPercent? }` |
| `takeProfit` | object | No | — | `{ triggerPercent, sellPercent? }` |

**Returns:**

```json
{
  "buy": { "orderId": "...", "status": "executing" },
  "stopLoss": { "orderId": "...", "triggerPercent": 15 },
  "takeProfit": { "orderId": "...", "triggerPercent": 100 }
}
```

SL/TP fields are `null` if not requested, or `{ "error": "..." }` if creation failed.

---

## Token Search & Info

### `search_tokens`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Token name or symbol |

### `get_token_info`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tokenAddress` | string | Yes | Contract address |

### `get_pump_bonding_curve`

Check launchpad/bonding curve status (pump.fun, Four.meme, etc).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tokenAddress` | string | Yes | Contract address |

### `get_token_security_report`

Comprehensive security report: scam flag, mint/freeze authority, holder concentration, liquidity locks.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tokenAddress` | string | Yes | Contract address |
| `networkId` | number | Yes | Network ID |

---

## Market Scanning

### Common Network IDs

| Network | ID |
|---------|-----|
| Solana | `1399811149` |
| Base | `8453` |
| Ethereum | `1` |
| BNB Chain | `56` |

### `scan_trending_tokens`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `networkId` | number | Yes | — | Network ID |
| `limit` | number | No | 20 | Results (1-50) |
| `minLiquidity` | number | No | — | Min liquidity USD |
| `minVolume24h` | number | No | — | Min 24h volume USD |

### `scan_new_tokens`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `networkId` | number | Yes | — | Network ID |
| `limit` | number | No | 20 | Results (1-50) |
| `minLiquidity` | number | No | — | Min liquidity USD |

### `scan_top_volume_tokens`

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `networkId` | number | Yes | — | Network ID |
| `limit` | number | No | 20 | Results (1-50) |
| `minLiquidity` | number | No | — | Min liquidity USD |

---

## Token Analytics

### `get_token_stats`

Comprehensive stats: price, changes, volume, holders, scam flags, all DEX pools with liquidity.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tokenAddress` | string | Yes | Contract address |
| `networkId` | number | Yes | Network ID |

### `get_price_history`

OHLCV candles for technical analysis.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tokenAddress` | string | Yes | — | Contract address |
| `networkId` | number | Yes | — | Network ID |
| `from` | number | Yes | — | Start (Unix seconds) |
| `to` | number | Yes | — | End (Unix seconds) |
| `resolution` | string | No | `"60"` | `1`, `5`, `15`, `30`, `60`, `240`, `720`, `1D`, `7D` |

### `get_recent_trades`

Recent swap events — buys/sells with amounts, prices, maker addresses.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `tokenAddress` | string | Yes | — | Contract address |
| `networkId` | number | Yes | — | Network ID |
| `limit` | number | No | 25 | Events (1-100) |

### `get_token_holders`

Holder analytics — count, top balances, concentration.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tokenAddress` | string | Yes | Contract address |
| `networkId` | number | Yes | Network ID |
| `cursor` | string | No | Pagination cursor |

### `get_top_holders_pct`

Top 10 holder percentage of supply.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tokenAddress` | string | Yes | Contract address |
| `networkId` | number | Yes | Network ID |

### `get_token_top_traders`

Top traders by PnL/volume.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tokenAddress` | string | Yes | Contract address |
| `networkId` | number | Yes | Network ID |

### `get_pair_stats`

DEX pair statistics.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `pairAddress` | string | Yes | — | Pair contract address |
| `networkId` | number | Yes | — | Network ID |
| `duration` | string | No | `"day1"` | `min5`, `hour1`, `hour4`, `hour12`, `day1` |

### `get_token_pairs`

List all DEX pairs/pools for a token.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tokenAddress` | string | Yes | Contract address |
| `networkId` | number | Yes | Network ID |

### `get_liquidity_locks`

Check if liquidity is locked.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tokenAddress` | string | Yes | Contract address |
| `networkId` | number | Yes | Network ID |

### `get_networks`

List all supported networks with IDs. No parameters.

---

## Wallet Analytics

### `get_wallet_stats`

Wallet PnL, win rate, trade count, bot/scammer scores, performance across timeframes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `walletAddress` | string | Yes | Wallet address |
| `networkId` | number | No | Filter to network |

### `get_wallet_trades`

Recent trades by a wallet.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `walletAddress` | string | Yes | — | Wallet address |
| `networkId` | number | No | — | Filter to network |
| `limit` | number | No | 25 | Trades (1-100) |

### `analyze_wallets`

Bulk wallet analysis — PnL, win rates, rankings.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `walletAddresses` | string[] | Yes | — | Addresses (1-50) |
| `rankBy` | string | No | `realizedProfitUsd30d` | Ranking attribute |

### `find_smart_wallets`

Most profitable wallets on a network (excludes bots/scammers).

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `networkId` | number | No | — | Filter to network |
| `limit` | number | No | 20 | Wallets (1-50) |
| `rankBy` | string | No | `realizedProfitUsd30d` | `realizedProfitUsd1d/1w/30d/1y` |

---

## Advanced

### `codex_query`

Escape hatch for any Codex GraphQL query. Pass an invalid method name to see available methods.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `method` | string | Yes | Codex SDK method name |
| `params` | string | Yes | JSON-encoded parameters |

---

## REST API — Token Management

Standard REST endpoints (not MCP tools). Used to manage agent tokens programmatically.

### `POST /agent/tokens`

Create a new token pair (read + write). Requires Privy JWT auth.

**Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accountId` | string | Yes | Account to bind tokens to |
| `chatId` | string | Yes | Telegram chat ID for notifications |
| `label` | string | No | Label (max 64 chars) |

**Response:**

```json
{
  "readToken": { "id": "...", "token": "<raw>", "permission": "read", "createdAt": "..." },
  "writeToken": { "id": "...", "token": "<raw>", "permission": "readwrite", "createdAt": "..." }
}
```

Raw tokens are returned **once** — the database stores SHA-256 hashes.

### `GET /agent/tokens`

List all active tokens. Returns `{ id, label, permission, accountId, lastUsedAt, createdAt }[]`.

### `DELETE /agent/tokens/:id`

Revoke a single token.

### `DELETE /agent/tokens/all`

Revoke all tokens for the user.

### `PATCH /agent/tokens/:id/limits`

Update spending limits on a write token.

```json
{ "maxPerTradeUsd": 100, "maxHourlyUsd": 500, "maxDailyUsd": 2000 }
```

Pass `null` to remove a limit.

### `PATCH /agent/tokens/:id/webhook`

Set or remove webhook URL. Returns the signing secret (shown once).

```json
{ "webhookUrl": "https://example.com/callback" }
```

Pass `{ "webhookUrl": null }` to remove.
