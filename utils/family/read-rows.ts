import type { PoolClient, QueryResultRow } from "pg";
import { FamilyDataError } from "./records";

export type FamilyPage = { limit: number; offset: number; maxBytes?: number };
export const responseSizeMessage =
  "Dữ liệu trả về vượt giới hạn. Với danh sách, hãy giảm số mục mỗi trang.";

export async function readRows<T extends QueryResultRow>(
  client: PoolClient,
  select: string,
  values: unknown[],
  textFields: readonly string[],
  maxBytes?: number,
): Promise<T[]> {
  if (maxBytes === undefined)
    return (await client.query<T>(select, values)).rows;

  // All column names come from the caller's fixed projection. octet_length
  // reads the original UTF-8 length even for compressed historical text.
  // Keep oversized text in PostgreSQL, before pg or JSON encoders allocate it.
  const rowBytes = textFields
    .map((field) => `coalesce(octet_length(${field})::bigint, 0)`)
    .join(" + ");
  const { rows } = await client.query<
    T & { page_ordinal?: string; too_large?: boolean }
  >(
    `WITH page AS MATERIALIZED (
       SELECT selected.*, row_number() OVER () AS page_ordinal FROM (${select}) selected
     ), checked AS (
       SELECT coalesce(sum(${rowBytes}), 0) > $${values.length + 1} AS too_large FROM page
     )
     SELECT page.*, checked.too_large FROM checked LEFT JOIN page ON NOT checked.too_large
     WHERE checked.too_large OR page.page_ordinal IS NOT NULL ORDER BY page.page_ordinal`,
    [...values, maxBytes],
  );
  if (rows[0]?.too_large) throw new FamilyDataError(responseSizeMessage);
  for (const row of rows) {
    delete row.page_ordinal;
    delete row.too_large;
  }
  return rows;
}
