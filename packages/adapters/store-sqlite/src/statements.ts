import type { DatabaseSync, StatementSync } from "node:sqlite";

/** What SQLite accepts as a bound parameter. */
export type Bindable = string | number | null;

/**
 * A prepared statement that knows what it returns and what it binds.
 *
 * `node:sqlite` types every row as `unknown`, so without this the assertion
 * would be repeated at each of ~20 call sites. Here it happens once per
 * statement, next to the SQL it belongs to.
 */
export type Query<Row, Params extends readonly Bindable[] = Bindable[]> = {
  all(...params: Params): Row[];
  get(...params: Params): Row | undefined;
  run(...params: Params): void;
};

/**
 * Statements are prepared lazily and kept, because preparing is the expensive
 * half and the pool issues the same handful of queries forever.
 */
export function statements(connection: DatabaseSync): {
  query: <Row, Params extends readonly Bindable[] = Bindable[]>(
    sql: string,
  ) => Query<Row, Params>;
} {
  const prepared = new Map<string, StatementSync>();

  const prepare = (sql: string): StatementSync => {
    const existing = prepared.get(sql);
    if (existing) return existing;
    const statement = connection.prepare(sql);
    prepared.set(sql, statement);
    return statement;
  };

  return {
    query: <Row, Params extends readonly Bindable[] = Bindable[]>(
      sql: string,
    ): Query<Row, Params> => ({
      all: (...params: Params) => prepare(sql).all(...params) as Row[],
      get: (...params: Params) =>
        prepare(sql).get(...params) as Row | undefined,
      run: (...params: Params) => {
        prepare(sql).run(...params);
      },
    }),
  };
}

/**
 * Expands to `?, ?, ?` for an `IN` clause. SQLite has no array binding, and the
 * count varies with the page, so the statement text varies with it too — which
 * is why these are not cached to a single prepared statement.
 */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}
