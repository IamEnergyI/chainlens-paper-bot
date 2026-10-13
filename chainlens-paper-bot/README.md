# ChainLens — Telegram Multichain Discovery & Paper-Trading Bot

Production-minded Telegram bot for token discovery, market analysis, configurable
strategies, and realistic paper trading. **Initial release: Solana + paper trading only.**
No real blockchain transactions are ever submitted; paper mode is enforced in code
and config (the process refuses to start with `PAPER_MODE=false`).

## Status

Implemented and tested in stages per `docs/testing.md`. Live provider integrations
(Jupiter quotes, Solana RPC event streaming, market data) are adapter interfaces +
contract fixtures; **live access is unverified in this environment** and marked as such.
Nothing here fabricates endpoints, fills, or successful integrations.

## Quick start

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL; TELEGRAM_BOT_TOKEN optional for dev
npm run migrate        # requires DATABASE_URL (Postgres or Supabase)
npm test               # unit + integration tests (pg-mem, no external services)
npm run typecheck && npm run lint
npm run build
npm start              # src/index.ts (tsx src/index.ts)
```

## Paper-only limitations

- Quote retrieval is read-only; there is no signing or broadcast code path.
- $1,000 virtual starting capital per strategy; percentage sizing.
- 50% global / 20% per-token dynamic exposure caps, enforced under concurrency
  with row locks + unique reservations.
- Missing or stale quotes never produce fills; unknown data stays unknown.

## Docs

- `docs/architecture.md` — components, data flows, state machines, valuation method
- `docs/database.md` — schema, constraints, ledger invariants
- `docs/provider-evaluation.md` — verified providers, terms, quotas, verification dates
- `docs/security.md` — trust boundaries, secrets, live-trading exclusion
- `docs/operations.md` — deployment, monitoring, backups, emergency stop
- `docs/testing.md` — test strategy and actual results
