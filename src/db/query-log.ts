import { AsyncLocalStorage } from "node:async_hooks";

/** Collects SQL queries logged by Drizzle for a single page render. */
export interface CapturedQuery {
  sql: string;
}

export const queryStore = new AsyncLocalStorage<CapturedQuery[]>();

/**
 * Run `fn` inside a fresh query-log context. All Drizzle queries executed
 * during `fn` are captured via the singleton db's logger. Returns both the
 * function result and the captured log.
 */
export async function withQueryLog<T>(
  fn: () => Promise<T>
): Promise<[T, CapturedQuery[]]> {
  const log: CapturedQuery[] = [];
  const result = await queryStore.run(log, fn);
  return [result, log];
}

/** Called by the Drizzle logger — appends to the current request's store. */
export function captureQuery(sql: string): void {
  const store = queryStore.getStore();
  if (store) store.push({ sql: sql.replace(/\s+/g, " ").trim() });
}
