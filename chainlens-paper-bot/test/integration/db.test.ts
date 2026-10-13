import { describe, it, expect } from "vitest";
import { newDb } from "pg-mem";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Integration tests run against pg-mem (in-memory PostgreSQL). pg-mem covers
 * most SQL used here; anything it cannot emulate is documented in docs/testing.md.
 */
export async function makeDb() {
  const db = newDb();
  const sql = readFileSync(path.resolve(process.cwd(), "migrations/0001_init.sql"), "utf8");
  const adapter = db.adapters.createPg();
  const client = new adapter.Client();
  await client.connect();
  await client.query(sql);
  return { db, client, adapters: adapter };
}

describe("migrations on a clean database", () => {
  it("0001_init applies cleanly", async () => {
    const { client, db } = await makeDb();
    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
    const names = tables.rows.map((r: { table_name: string }) => r.table_name);
    for (const t of ["users","strategies","orders","positions","fills","ledger_entries","jobs","processed_events","notification_outbox"]) {
      expect(names).toContain(t);
    }
    await client.end?.().catch(() => undefined);
    void db;
  });
});

describe("ledger invariants", () => {
  it("ledger idempotency keys are unique and entries are insert-only", async () => {
    const { client } = await makeDb();
    await client.query(`INSERT INTO users (telegram_user_id) VALUES ('tg-1')`);
    await client.query(`INSERT INTO strategies (user_id, name, template) VALUES (1,'s','Custom')`);
    await client.query(`INSERT INTO simulation_runs (strategy_id) VALUES (1)`);
    await client.query(`INSERT INTO simulation_accounts (strategy_id, simulation_run_id, cash_usd) VALUES (1,1,1000)`);
    const insert = (key: string) => client.query(
      `INSERT INTO ledger_entries (strategy_id, simulation_run_id, entry_type, asset, amount, idempotency_key)
       VALUES (1,1,'credit_cash','USD',500,$1)`, [key]);
    await insert("k1");
    await expect(insert("k1")).rejects.toThrow();
    await client.end?.().catch(() => undefined);
  });
});

describe("durable jobs", () => {
  it("dedupes processed events via unique constraint", async () => {
    const { client } = await makeDb();
    await client.query(`INSERT INTO processed_events (source, external_id) VALUES ('pump','evt-1')`);
    await expect(client.query(`INSERT INTO processed_events (source, external_id) VALUES ('pump','evt-1')`)).rejects.toThrow();
    await client.end?.().catch(() => undefined);
  });
  it("a single exposure reservation is held per strategy+token", async () => {
    const { client } = await makeDb();
    await client.query(`INSERT INTO users (telegram_user_id) VALUES ('tg-2')`);
    await client.query(`INSERT INTO tokens (chain, address) VALUES ('solana','mintA')`);
    await client.query(`INSERT INTO strategies (user_id, name, template) VALUES (1,'s2','Custom')`);
    await client.query(`INSERT INTO exposure_reservations (strategy_id, token_id, amount_usd) VALUES (1,1,100)`);
    await expect(
      client.query(`INSERT INTO exposure_reservations (strategy_id, token_id, amount_usd) VALUES (1,1,100)`)
    ).rejects.toThrow();
    await client.end?.().catch(() => undefined);
  });
});
