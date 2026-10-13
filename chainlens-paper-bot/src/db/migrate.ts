import { readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

/**
 * Runs SQL migration files in lexicographic order exactly once.
 * Works against PostgreSQL and Supabase (postgres role or service key).
 */
export async function migrate(pool: pg.Pool, migrationsDir: string): Promise<string[]> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    const done = await pool.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [file]);
    if (done.rows.length > 0) continue;
    const sql = await import("node:fs/promises").then((fs) => fs.readFile(path.join(migrationsDir, file), "utf8"));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
    applied.push(file);
  }
  return applied;
}

const run = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const pool = new pg.Pool({ connectionString: url });
  const applied = await migrate(pool, path.resolve(process.cwd(), "migrations"));
  console.log(`applied migrations: ${applied.join(", ") || "(none)"}`);
  await pool.end();
};
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((e) => { console.error(e); process.exit(1); });
}
