import type pg from "pg";
import { AppError } from "../domain/errors.js";
import type { MicroUsd } from "../domain/money.js";
import { microsFromDecimalString } from "../domain/money.js";

export type LedgerEntryType = "credit_cash" | "debit_cash" | "debit_asset" | "credit_asset" | "debit_fee" | "pnl_realized";

/**
 * Immutable, ledger-backed accounting. Every entry is inserted with a unique
 * idempotency key; balances reconcile against the ledger and nothing is ever
 * updated or deleted. All writes happen inside the caller's transaction.
 */
export class Ledger {
  constructor(private db: pg.PoolClient) {}

  async post(opts: {
    strategyId: number;
    simulationRunId: number;
    entryType: LedgerEntryType;
    asset: string; // 'USD' or 'chain:address'
    amount: MicroUsd;
    positionId?: number;
    orderId?: number;
    memo?: string;
    idempotencyKey: string;
  }): Promise<void> {
    if (opts.amount === 0n) throw new AppError("VALIDATION", "ledger amount must be non-zero");
    const dup = await this.db.query("SELECT 1 FROM ledger_entries WHERE idempotency_key=$1", [opts.idempotencyKey]);
    if (dup.rows.length > 0) return; // idempotent replay
    const r = await this.db.query(
      `INSERT INTO ledger_entries
        (strategy_id, simulation_run_id, position_id, order_id, entry_type, asset, amount, memo, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        opts.strategyId, opts.simulationRunId, opts.positionId ?? null, opts.orderId ?? null,
        opts.entryType, opts.asset, opts.amount.toString(), opts.memo ?? null, opts.idempotencyKey
      ]
    );
    if (r.rowCount === 0) throw new AppError("IDEMPOTENCY", "ledger insert raced on idempotency key");
  }

  /** Sum of signed USD flows from the ledger for a strategy in a run. */
  async usdBalance(strategyId: number, simulationRunId: number): Promise<MicroUsd> {
    const r = await this.db.query(
      `SELECT COALESCE(SUM(
           CASE entry_type
             WHEN 'credit_cash' THEN amount
             WHEN 'debit_cash' THEN -amount
             WHEN 'debit_fee' THEN -amount
             WHEN 'pnl_realized' THEN amount
             ELSE 0
           END), 0) AS balance
       FROM ledger_entries
       WHERE strategy_id=$1 AND simulation_run_id=$2 AND asset='USD'`,
      [strategyId, simulationRunId]
    );
    return microsFromDecimalString(String(r.rows[0].balance));
  }
}
