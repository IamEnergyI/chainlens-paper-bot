# Operations

## Deployment

Node 20+, Postgres/Supabase. Processes: `src/index.ts` (Telegram bot/API) and
workers claiming from the `jobs` table. Migrations run at deploy (`npm run migrate`).

## Monitoring

Structured logs with correlation ids; `system_health` tracks last processed chain
event per source, job backlog/age, provider latency/failures/quota, stale-quote
rate, duplicate suppression, reconciliation failures, notification backlog.

## Emergency stop

Operator command (`OPERATOR_IDS`) flips a flag that blocks new simulated entries
without deleting positions or disabling accounting/recovery. Existing positions
remain monitored; cap reductions never auto-liquidate.

## Backups / recovery

Postgres PITR or scheduled dumps. On restart: workers reclaim expired leases;
reconciliation checks unfinished jobs/orders, open positions, held reservations,
pending notifications, and ledger-vs-cash balance. Ledger inconsistency blocks
affected new entries until resolved.
