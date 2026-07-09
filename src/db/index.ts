import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";
import { env } from "@/lib/env";
import { captureQuery } from "./query-log";

type DB = NeonHttpDatabase<typeof schema>;

const dbLogger = {
  logQuery(sql: string) {
    captureQuery(sql);
  },
};

// Lazily initialize the Neon client on first use so that importing this module
// (e.g. from a page that renders a "setup needed" screen) does not throw when
// DATABASE_URL is not yet configured.
let _db: DB | null = null;
function init(): DB {
  if (!_db) _db = drizzle(neon(env.databaseUrl), { schema, logger: dbLogger });
  return _db;
}

export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const inst = init() as unknown as Record<string | symbol, unknown>;
    const value = inst[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(inst) : value;
  },
});

export { schema };
