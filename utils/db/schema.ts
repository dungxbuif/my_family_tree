export const tableColumns = {
  persons: [
    "id",
    "full_name",
    "gender",
    "birth_year",
    "birth_month",
    "birth_day",
    "death_year",
    "death_month",
    "death_day",
    "death_lunar_year",
    "death_lunar_month",
    "death_lunar_day",
    "is_deceased",
    "is_in_law",
    "birth_order",
    "generation",
    "other_names",
    "avatar_url",
    "note",
    "created_at",
    "updated_at",
  ],
  person_details_private: [
    "person_id",
    "phone_number",
    "occupation",
    "current_residence",
    "created_at",
    "updated_at",
  ],
  relationships: [
    "id",
    "type",
    "person_a",
    "person_b",
    "note",
    "created_at",
    "updated_at",
  ],
  custom_events: [
    "id",
    "name",
    "content",
    "event_date",
    "location",
    "created_by",
    "created_at",
    "updated_at",
  ],
  gallery_items: [
    "id",
    "title",
    "description",
    "image_url",
    "event_date",
    "created_at",
    "created_by",
  ],
  profiles: ["id", "role", "is_active", "created_at", "updated_at"],
  users: ["id", "email", "password_hash", "created_at", "updated_at"],
} as const;

export type TableName = keyof typeof tableColumns;

export function assertTableName(table: string): asserts table is TableName {
  if (!(table in tableColumns)) {
    throw new Error(`Unsupported table: ${table}`);
  }
}

export function assertColumn(table: TableName, column: string) {
  if (!(tableColumns[table] as readonly string[]).includes(column)) {
    throw new Error(`Unsupported column ${table}.${column}`);
  }
}

export function quoteIdent(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

