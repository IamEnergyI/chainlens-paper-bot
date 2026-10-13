import type pg from "pg";
import { AppError } from "../domain/errors.js";

export const MAX_ATTEMPTS_DEFAULT = 8;

export function backoffMs(attempts: number, baseMs = 1000, maxMs = 5 * 60_000, jitterRatio = 0.2): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attempts);
  const jitter = exp * jitterRatio * (Math.random() * 2 - 1);
  return Math.max(0, Math.floor(exp + jitter));
}

export interface Job {
  id: number;
  queue: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

/** PostgreSQL-backed durable job queue: transactional claiming, leases, backoff, dead-letter. */
export class JobQueue {
  constructor(private pool: pg.Pool) {}

  async enqueue(client: pg.PoolClient | pg.Pool, queue: string, payload: unknown, opts: { runAtMs?: number; idempotencyKey?: string } = {}): Promise<number> {
    const r = await client.query(
      `INSERT INTO jobs (queue, payload, run_at) VALUES ($1, $2, COALESCE($3, now()))
       RETURNING id`,
      [queue, JSON.stringify(payload), opts.runAtMs ? new Date(opts.runAtMs) : null]
    );
    return r.rows[0].id as number;
  }

  /** Atomically claim the next available job (FOR UPDATE SKIP LOCKED). */
  async claim(queue: string, leaseOwner: string, leaseMs: number): Promise<Job | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        `UPDATE jobs SET status='leased', lease_owner=$1, lease_expires_at=$2, attempts=attempts+1, updated_at=now()
         WHERE id = (
           SELECT id FROM jobs
           WHERE queue=$3 AND status='pending' AND run_at <= now()
              OR (queue=$3 AND status='leased' AND lease_expires_at < now())
           ORDER BY run_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         RETURNING id, queue, payload, attempts, max_attempts`,
        [leaseOwner, new Date(Date.now() + leaseMs), queue]
      );
      if (r.rows.length === 0) { await client.query("COMMIT"); return null; }
      const row = r.rows[0];
      await client.query("COMMIT");
      return { id: row.id, queue: row.queue, payload: row.payload, attempts: row.attempts, maxAttempts: row.max_attempts };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  /** Mark success. Idempotent: only from leased state. */
  async complete(jobId: number, leaseOwner: string): Promise<void> {
    await this.pool.query(
      `UPDATE jobs SET status='done', updated_at=now()
       WHERE id=$1 AND lease_owner=$2 AND status='leased'`,
      [jobId, leaseOwner]
    );
  }

  /** Failure path: backoff retry or dead-letter. */
  async fail(jobId: number, leaseOwner: string, error: unknown): Promise<"retried" | "dead"> {
    const message = error instanceof Error ? error.message : String(error);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        `UPDATE jobs SET last_error=$1, updated_at=now(),
           status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'pending' END,
           run_at = CASE WHEN attempts >= max_attempts THEN run_at ELSE now() + ($2 || ' milliseconds')::interval END,
           lease_owner = NULL, lease_expires_at = NULL
         WHERE id=$3 AND lease_owner=$4 AND status='leased'
         RETURNING status, attempts, max_attempts`,
        [message.slice(0, 2000), backoffMs(0), jobId, leaseOwner]
      );
      await client.query("COMMIT");
      if (r.rows.length === 0) throw new AppError("CONFLICT", `job ${jobId} not leased by ${leaseOwner}`);
      return r.rows[0].status === "dead" ? "dead" : "retried";
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }
}
