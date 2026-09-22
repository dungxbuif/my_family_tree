import type { QuerySpec } from "@/utils/db/table-client";

interface QueryResponse<T> {
  data: T | null;
  error: { message: string } | null;
}

class BrowserQueryBuilder<T = unknown> implements PromiseLike<QueryResponse<T>> {
  private spec: QuerySpec;

  constructor(table: string, action: QuerySpec["action"] = "select") {
    this.spec = { table, action, filters: [], orders: [] };
  }

  select(columns = "*") {
    this.spec.action = "select";
    this.spec.select = columns;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.spec.action = "insert";
    this.spec.payload = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.spec.action = "update";
    this.spec.payload = payload;
    return this;
  }

  delete() {
    this.spec.action = "delete";
    return this;
  }

  upsert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.spec.action = "upsert";
    this.spec.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.spec.filters?.push({ op: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.spec.filters?.push({ op: "neq", column, value });
    return this;
  }

  ilike(column: string, value: string) {
    this.spec.filters?.push({ op: "ilike", column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.spec.filters?.push({ op: "in", column, values });
    return this;
  }

  or(expression: string) {
    this.spec.filters?.push({ op: "or", expression });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.spec.orders?.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  limit(limit: number) {
    this.spec.limit = limit;
    return this;
  }

  range(from: number, to: number) {
    this.spec.range = [from, to];
    return this;
  }

  single() {
    this.spec.single = true;
    return this;
  }

  async execute() {
    const response = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.spec),
    });

    return (await response.json()) as QueryResponse<T>;
  }

  then<TResult1 = QueryResponse<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResponse<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export function createClient() {
  return {
    from<T = unknown>(table: string) {
      return new BrowserQueryBuilder<T>(table);
    },
  };
}

