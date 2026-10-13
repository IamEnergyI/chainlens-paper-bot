# Provider Evaluation

Verification dates are recorded honestly. **Live API calls were NOT possible in
the build environment** (no credentials/network egress); findings below are from
official public documentation patterns and must be re-verified before launch.

| Provider | Purpose | Status | Verified | Notes |
|---|---|---|---|---|
| Jupiter v6 Quote API | Solana swap quotes (read-only) | Adapter + fixture contract tests; live unverified | 2026-10-14 | Check terms/rate limits/quote TTL for production |
| Solana RPC (Helius/QuickNode candidates) | Event ingestion, account data | Interface defined; live unverified | 2026-10-14 | WebSocket subscriptions, quota and pricing pending |
| Pump.fun / Raydium / Meteora | Launch + pool events | Candidates only; no integration claimed | 2026-10-14 | Event coverage + terms unverified |
| Independent market data (Birdeye/Dexscreener candidates) | Enrichment | Candidates only | 2026-10-14 | — |

Rule: an integration may only be marked "working" after contract tests against
documented fixtures AND a successful live call are both recorded here.
