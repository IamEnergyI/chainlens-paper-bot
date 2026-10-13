# Database

PostgreSQL / Supabase. Migrations in `migrations/` run once via `schema_migrations`.

## Key invariants

- `ledger_entries` is insert-only with unique `idempotency_key`; balances in
  `simulation_accounts` must reconcile against the ledger.
- `orders.idempotency_key`, `fills.idempotency_key`, `processed_events(source, external_id)`
  provide idempotency for all side effects.
- `exposure_reservations` has a partial unique index enforcing a single held
  reservation per (strategy, token); reservation + check runs under
  `SELECT ... FOR UPDATE` on the strategy row.
- Jobs: transactional claiming via `FOR UPDATE SKIP LOCKED`, leases with expiry,
  bounded retries with jittered backoff, `dead` terminal state.
- Tokens are identified by `(chain, address)` — never by symbol.
- Every market metric snapshot carries `source` and `observed_at`.
- Ownership: every user-scoped query filters by `user_id` verified from the
  Telegram identity; RLS policies are applied in Supabase for the `anon` role.

## Retention defaults

Operational logs 30d; market snapshots 180d then aggregate; strategy/order/fill/
ledger history retained while the account is active; account deletion stops new
activity, then deletes/anonymizes eligible data and cancels pending jobs.
