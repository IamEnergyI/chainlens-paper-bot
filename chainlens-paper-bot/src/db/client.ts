import pg from "pg";
import { AppError } from "../domain/errors.js";

export type Db = pg.Pool | pg.PoolClient | pg.ClientBase;

export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function queryOne<T>(db: Db, sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await db.query(sql, params);
  return (r.rows[0] as T | undefined) ?? null;
}

export async function query<T>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await db.query(sql, params);
  return r.rows as T[];
}

export function notNull<T>(v: T | null, what: string): T {
  if (v === null) throw new AppError("NOT_FOUND", `${what} not found`);
  return v;
}
