import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "./schema.js";

let dbSingleton: Kysely<Database> | undefined;

/**
 * Shared Kysely client, one pool per process. Reused by both apps/api and apps/worker
 * (see docs/ARCHITECTURE.md) so neither runtime opens its own unbounded connection pool.
 */
export function getDb(): Kysely<Database> {
  if (!dbSingleton) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set.");
    }
    dbSingleton = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString, max: 20 }),
      }),
    });
  }
  return dbSingleton;
}

export type { Database } from "./schema.js";
export * from "./schema.js";
