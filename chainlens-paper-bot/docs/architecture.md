# Architecture

Modular monolith. Shared domain core; separately deployable processes for the
Telegram bot/API and background workers (job queue).

## Layers

1. `src/telegram` — grammY handlers (thin), persisted conversation state.
2. `src/config`, `src/domain` — types, errors, money (bigint micro-USD), clocks, state machines.
3. `src/db`, `src/jobs` — Postgres repositories, durable job queue (leases, backoff, dead-letter).
4. `src/discovery` — event ingestion → normalize → identify → dedup → enrich →
   freshness validation → snapshot store → feed. Strategy evaluation is independent.
5. `src/strategy` — templates, rule evaluation, validation/contradiction detection, sizing.
6. `src/risk` — exposure engine (dynamic caps, atomic reservations), risk profiles.
7. `src/execution` — paper-trading engine, quick preview, state machines.
8. `src/ledger` — immutable double-entry ledger; balances reconcile against it.
9. `src/notify` — durable notification outbox (delivery independent of trading).
10. `src/providers` — typed adapters (Jupiter quote, market data, Solana RPC).

## Token eligibility states

`Detected` → `Analyzable` (fresh data) → `QuoteEligible` (usable quote for size).
Never collapsed into one tradability flag.

## Valuation method

Combined current virtual equity = per-strategy virtual cash plus marked value of
open positions less accrued modeled costs. Marks use the latest validated quote
price; if positions cannot be valued (missing/stale data), affected new entries
are blocked, never estimated.

## Exit rules

Exits use fresh quotes; a trigger is not an execution; failed exit quotes leave
the position open and retry with bounded backoff. A position closes only after
the simulated exit fill and ledger entries commit in one transaction.
