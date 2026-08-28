import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

/**
 * Minimal, dependency-light migration runner. Applies every `.sql` file in
 * `packages/db/migrations/`, in filename order, that isn't already recorded in
 * `_migrations`, each inside its own transaction. See docs/DECISIONS.md D2 for why this
 * replaced Prisma Migrate (its CLI depends on a binary fetched from a CDN that isn't
 * reachable in every environment this project needs to run in).
 */
export async function runMigrations(
  databaseUrl: string = process.env.DATABASE_URL ?? "",
  migrationsDir: string = join(__dirname, "..", "migrations"),
): Promise<{ applied: string[] }> {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const applied: string[] = [];

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const alreadyApplied = new Set(
      (await pool.query<{ name: string }>("SELECT name FROM _migrations")).rows.map(
        (r) => r.name,
      ),
    );

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (alreadyApplied.has(file)) continue;

      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }

  return { applied };
}

// Allow `tsx src/migrate.ts` direct invocation.
if (require.main === module) {
  runMigrations()
    .then(({ applied }) => {
      if (applied.length === 0) {
        console.log("[migrate] Nothing to apply — database is up to date.");
      } else {
        console.log(`[migrate] Applied ${applied.length} migration(s): ${applied.join(", ")}`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("[migrate] Failed:", err.message);
      process.exit(1);
    });
}
