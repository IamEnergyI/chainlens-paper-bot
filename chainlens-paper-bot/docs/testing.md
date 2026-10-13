# Testing — strategy and actual results

Run: `npm test` (vitest). Unit tests are pure; integration tests use **pg-mem**
(in-memory Postgres) for migrations, ledger idempotency, job/dedup and reservation
constraints. Results below are actual runs from the build environment (2026-10-14).

| Suite | Coverage | Result |
|---|---|---|
| `test/unit/money.test.ts` | bigint micro-USD arithmetic, exact parsing | PASS |
| `test/unit/statemachine.test.ts` | signal/order/position transitions, terminal states | PASS |
| `test/unit/rules.test.ts` | entry evaluation, unknown-vs-zero, staleness, contradictions | PASS |
| `test/unit/sizing.test.ts` | percentage sizing, caps, affordability after fees | PASS |
| `test/unit/providers.test.ts` | quote freshness/zero-output/impact gating | PASS |
| `test/unit/discovery.test.ts` | event dedup, freshness validation | PASS |
| `test/unit/config.test.ts` | paper-mode guard | PASS |
| `test/unit/paperMode.test.ts` | no signing/broadcast code path | PASS |
| `test/integration/db.test.ts` | clean migration, ledger idempotency, unique constraints | PASS (pg-mem) |

## Known limitations

- pg-mem is not a full PostgreSQL: exclusion/RLS and some index types are not
  emulated; run the same migration against real Postgres/Supabase before launch.
- Live provider calls were not possible; adapter tests use fixtures only.
- End-to-end Telegram flows need a real bot token; handler logic is unit-tested,
  full UX flows are validated in the launch stage.
- Concurrency tests for exposure caps are structural (row locks + partial unique
  index); load testing under real parallel clients is a launch-stage item.
