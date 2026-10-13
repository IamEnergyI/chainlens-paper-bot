import type pg from "pg";

export type NotificationCategory = "discovery" | "signal" | "entry" | "exit_trigger" | "exit" | "risk" | "system";

/**
 * Durable notification outbox. Telegram delivery failures never affect trade
 * execution; retries are independent; event history is preserved even when
 * notifications are muted or delivery fails.
 */
export class NotificationOutbox {
  constructor(private db: pg.PoolClient | pg.Pool) {}

  async enqueue(userId: number, category: NotificationCategory, payload: unknown): Promise<number> {
    const r = await this.db.query(
      `INSERT INTO notification_outbox (user_id, category, payload) VALUES ($1,$2,$3) RETURNING id`,
      [userId, category, JSON.stringify(payload)]
    );
    return r.rows[0].id as number;
  }

  async claimBatch(limit = 20): Promise<{ id: number; userId: number; category: string; payload: unknown }[]> {
    const r = await this.db.query(
      `UPDATE notification_outbox SET attempts=attempts+1
       WHERE id IN (
         SELECT id FROM notification_outbox
         WHERE status='pending' AND next_attempt_at <= now()
         ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED
       )
       RETURNING id, user_id, category, payload`,
      [limit]
    );
    return r.rows.map((row) => ({ id: row.id, userId: row.user_id, category: row.category, payload: row.payload }));
  }

  async markSent(id: number): Promise<void> {
    await this.db.query(`UPDATE notification_outbox SET status='sent' WHERE id=$1`, [id]);
  }

  async markFailed(id: number, backoffMs: number): Promise<void> {
    await this.db.query(
      `UPDATE notification_outbox SET status='pending', next_attempt_at=now() + ($1 || ' milliseconds')::interval
       WHERE id=$2 AND attempts < 10`,
      [backoffMs, id]
    );
    await this.db.query(`UPDATE notification_outbox SET status='failed' WHERE id=$1 AND attempts >= 10`, [id]);
  }
}
