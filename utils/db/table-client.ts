import { query } from "@/utils/db/client";
import { assertColumn, assertTableName, quoteIdent, type TableName } from "@/utils/db/schema";

type Payload = object | object[];

type Filter =
  | { op: "eq" | "neq" | "ilike"; column: string; value: unknown }
  | { op: "in"; column: string; values: unknown[] }
  | { op: "or"; expression: string };

type Order = { column: string; ascending: boolean; nullsFirst?: boolean };

interface QuerySpec {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert";
  select?: string;
  payload?: Payload;
  filters?: Filter[];
  orders?: Order[];
  limit?: number;
  range?: [number, number];
  single?: boolean;
}

interface QueryResponse<TData> {
  data: TData | null;
  error: { message: string } | null;
}

function parseSelectedColumns(table: TableName, select?: string) {
  if (!select || select.trim() === "*" || select.includes("!")) {
    return `${quoteIdent(table)}.*`;
  }

  return select
    .split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((column) => {
      assertColumn(table, column);
      return `${quoteIdent(table)}.${quoteIdent(column)}`;
    })
    .join(", ");
}

function addFilters(
  table: TableName,
  filters: Filter[],
  values: unknown[],
  clauses: string[],
) {
  for (const filter of filters) {
    if (filter.op === "or") {
      const parts = filter.expression.split(",").map((part) => part.trim());
      const orClauses: string[] = [];

      for (const part of parts) {
        const match = part.match(/^([a-zA-Z0-9_]+)\.(eq|neq)\.(.+)$/);
        if (!match) throw new Error(`Unsupported OR filter: ${part}`);
        const [, column, op, value] = match;
        assertColumn(table, column);
        values.push(value);
        orClauses.push(
          `${quoteIdent(table)}.${quoteIdent(column)} ${op === "eq" ? "=" : "!="} $${values.length}`,
        );
      }

      clauses.push(`(${orClauses.join(" OR ")})`);
      continue;
    }

    assertColumn(table, filter.column);

    if (filter.op === "in") {
      if (filter.values.length === 0) {
        clauses.push("false");
        continue;
      }
      const placeholders = filter.values.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      clauses.push(
        `${quoteIdent(table)}.${quoteIdent(filter.column)} IN (${placeholders.join(", ")})`,
      );
      continue;
    }

    values.push(filter.value);
    const operator =
      filter.op === "eq" ? "=" : filter.op === "neq" ? "!=" : "ILIKE";
    clauses.push(
      `${quoteIdent(table)}.${quoteIdent(filter.column)} ${operator} $${values.length}`,
    );
  }
}

function buildRelationshipSelect(table: TableName, select?: string) {
  if (table !== "relationships" || !select?.includes("!")) {
    return { selectSql: parseSelectedColumns(table, select), joinSql: "" };
  }

  const joins: string[] = [`relationships.*`];
  const joinSql: string[] = [];

  if (select.includes("target:persons!person_b")) {
    joins.push("to_jsonb(target.*) AS target");
    joinSql.push("LEFT JOIN persons target ON target.id = relationships.person_b");
  }
  if (select.includes("target:persons!person_a")) {
    joins.push("to_jsonb(target.*) AS target");
    joinSql.push("LEFT JOIN persons target ON target.id = relationships.person_a");
  }
  if (select.includes("person_a_data:persons!person_a")) {
    joins.push("to_jsonb(person_a_data.*) AS person_a_data");
    joinSql.push(
      "LEFT JOIN persons person_a_data ON person_a_data.id = relationships.person_a",
    );
  }
  if (select.includes("person_b_data:persons!person_b")) {
    joins.push("to_jsonb(person_b_data.*) AS person_b_data");
    joinSql.push(
      "LEFT JOIN persons person_b_data ON person_b_data.id = relationships.person_b",
    );
  }

  return { selectSql: joins.join(", "), joinSql: joinSql.join(" ") };
}

export async function executeQuerySpec<T = unknown, TData = T[]>(
  spec: QuerySpec,
): Promise<QueryResponse<TData>> {
  try {
    assertTableName(spec.table);
    const table = spec.table;
    const filters = spec.filters ?? [];
    const orders = spec.orders ?? [];

    if (spec.action === "select") {
      const values: unknown[] = [];
      const clauses: string[] = [];
      const { selectSql, joinSql } = buildRelationshipSelect(table, spec.select);

      addFilters(table, filters, values, clauses);

      let sql = `SELECT ${selectSql} FROM ${quoteIdent(table)} ${joinSql}`;
      if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;

      if (orders.length) {
        sql +=
          " ORDER BY " +
          orders
            .map((order) => {
              assertColumn(table, order.column);
              return `${quoteIdent(table)}.${quoteIdent(order.column)} ${
                order.ascending ? "ASC" : "DESC"
              }${order.nullsFirst == null ? "" : order.nullsFirst ? " NULLS FIRST" : " NULLS LAST"}`;
            })
            .join(", ");
      }

      if (spec.range) {
        const [from, to] = spec.range;
        sql += ` LIMIT ${Math.max(0, to - from + 1)} OFFSET ${Math.max(0, from)}`;
      } else if (spec.limit != null) {
        sql += ` LIMIT ${Math.max(0, spec.limit)}`;
      }

      const result = await query(sql, values);
      const data = spec.single
        ? ((result.rows[0] ?? null) as TData)
        : (result.rows as TData);
      return { data, error: null };
    }

    if (spec.action === "insert" || spec.action === "upsert") {
      const rows = Array.isArray(spec.payload) ? spec.payload : [spec.payload ?? {}];
      const inserted: unknown[] = [];

      for (const row of rows) {
        const entries = Object.entries(row).filter(([, value]) => value !== undefined);
        for (const [column] of entries) assertColumn(table, column);
        const columns = entries.map(([column]) => quoteIdent(column));
        const values = entries.map(([, value]) => value);
        const placeholders = values.map((_, index) => `$${index + 1}`);
        let sql = `INSERT INTO ${quoteIdent(table)} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`;

        if (spec.action === "upsert") {
          const conflictColumn = table === "person_details_private" ? "person_id" : "id";
          const updates = entries
            .filter(([column]) => column !== conflictColumn)
            .map(([column]) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`);
          sql += ` ON CONFLICT (${quoteIdent(conflictColumn)}) DO UPDATE SET ${updates.join(", ")}`;
        }

        sql += " RETURNING *";
        const result = await query(sql, values);
        inserted.push(result.rows[0]);
      }

      const data = spec.single
        ? ((inserted[0] ?? null) as TData)
        : (inserted as TData);
      return { data, error: null };
    }

    if (spec.action === "update") {
      const payload = (spec.payload ?? {}) as object;
      const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
      const values: unknown[] = [];
      const setSql = entries.map(([column, value]) => {
        assertColumn(table, column);
        values.push(value);
        return `${quoteIdent(column)} = $${values.length}`;
      });
      const clauses: string[] = [];
      addFilters(table, filters, values, clauses);
      const sql = `UPDATE ${quoteIdent(table)} SET ${setSql.join(", ")}${
        clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""
      } RETURNING *`;
      const result = await query(sql, values);
      const data = spec.single
        ? ((result.rows[0] ?? null) as TData)
        : (result.rows as TData);
      return { data, error: null };
    }

    if (spec.action === "delete") {
      const values: unknown[] = [];
      const clauses: string[] = [];
      addFilters(table, filters, values, clauses);
      const sql = `DELETE FROM ${quoteIdent(table)}${
        clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""
      } RETURNING *`;
      const result = await query(sql, values);
      return { data: result.rows as TData, error: null };
    }

    return { data: null, error: { message: "Unsupported action" } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { data: null, error: { message } };
  }
}

class QueryBuilder<T = unknown, TData = T[]>
  implements PromiseLike<QueryResponse<TData>>
{
  private spec: QuerySpec;

  constructor(table: string, action: QuerySpec["action"] = "select") {
    this.spec = { table, action, filters: [], orders: [] };
  }

  select(columns = "*") {
    this.spec.action = "select";
    this.spec.select = columns;
    return this as unknown as QueryBuilder<T, T[]>;
  }

  insert(payload: Payload) {
    this.spec.action = "insert";
    this.spec.payload = payload;
    return this;
  }

  update(payload: object) {
    this.spec.action = "update";
    this.spec.payload = payload;
    return this;
  }

  delete() {
    this.spec.action = "delete";
    return this;
  }

  upsert(payload: Payload) {
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

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.spec.orders?.push({
      column,
      ascending: options?.ascending ?? true,
      nullsFirst: options?.nullsFirst,
    });
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
    return this as unknown as QueryBuilder<T, T | null>;
  }

  then<TResult1 = QueryResponse<TData>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResponse<TData>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return executeQuerySpec<T, TData>(this.spec).then(onfulfilled, onrejected);
  }
}

export function createServerDataClient() {
  return {
    from<T = unknown>(table: string) {
      return new QueryBuilder<T, T[]>(table);
    },
  };
}

export type { QuerySpec };
