import type { Person, Relationship, GalleryItem } from "@/types";
import { FamilyDataError, uuid } from "./records";
import { validateLifeDates } from "./life-dates";

export type BackupPerson = Omit<
  Person,
  | "tree_id"
  | "linked_user_id"
  | "created_at"
  | "updated_at"
  | "phone_number"
  | "occupation"
  | "current_residence"
>;
export type BackupEdge = Pick<
  Relationship,
  "id" | "type" | "person_a" | "person_b" | "note"
>;
export type BackupPrivate = {
  person_id: string;
  phone_number: string | null;
  occupation: string | null;
  current_residence: string | null;
};
export type BackupEvent = {
  id: string;
  name: string;
  content: string | null;
  event_date: string;
  location: string | null;
};
export type BackupGallery = Pick<
  GalleryItem,
  "id" | "title" | "description" | "image_url" | "event_date"
>;
export interface Backup {
  version: 4;
  timestamp: string;
  persons: BackupPerson[];
  relationships: BackupEdge[];
  person_details_private: BackupPrivate[];
  custom_events: BackupEvent[];
  gallery_items: BackupGallery[];
}

export const backupFields = {
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
    "email",
  ],
  relationships: ["id", "type", "person_a", "person_b", "note"],
  person_details_private: [
    "person_id",
    "phone_number",
    "occupation",
    "current_residence",
  ],
  custom_events: ["id", "name", "content", "event_date", "location"],
  gallery_items: ["id", "title", "description", "image_url", "event_date"],
};
const bad = () =>
  new FamilyDataError("Bản sao lưu không hợp lệ. Vui lòng kiểm tra dữ liệu.");
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw bad();
  return value as Record<string, unknown>;
}
function text(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.includes("\0")) throw bad();
  return value;
}
function required(value: unknown) {
  const s = text(value)?.trim();
  if (!s) throw bad();
  return s;
}
function id(value: unknown) {
  const s = required(value);
  if (!uuid.test(s)) throw bad();
  return s.toLowerCase();
}
function integer(value: unknown) {
  if (value == null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < -2147483648 ||
    value > 2147483647
  )
    throw bad();
  return value;
}
function bool(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "boolean") throw bad();
  return value;
}
// The old PostgreSQL DATE reader serialized server-local midnight as a JS Date.
function legacyEventDate(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  )
    return date(value);
  const instant = new Date(value);
  if (!Number.isFinite(instant.valueOf()) || instant.toISOString() !== value)
    throw bad();
  if (value.endsWith("T00:00:00.000Z")) return date(value.slice(0, 10));
  if (
    instant.getHours() === 0 &&
    instant.getMinutes() === 0 &&
    instant.getSeconds() === 0 &&
    instant.getMilliseconds() === 0
  ) {
    return date(
      [
        String(instant.getFullYear()).padStart(4, "0"),
        String(instant.getMonth() + 1).padStart(2, "0"),
        String(instant.getDate()).padStart(2, "0"),
      ].join("-"),
    );
  }
  // An operator may move a Vietnamese installation to a server running in UTC.
  if (value.endsWith("T17:00:00.000Z"))
    return date(
      new Date(instant.valueOf() + 7 * 3600000).toISOString().slice(0, 10),
    );
  throw bad();
}
function date(value: unknown) {
  const s = required(value);
  if (
    !/^\d{4}-\d\d-\d\d$/.test(s) ||
    s.startsWith("0000") ||
    Number.isNaN(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw bad();
  return s;
}
function unique(values: string[]) {
  if (new Set(values).size !== values.length) throw bad();
}
function validateGraph(people: Set<string>, edges: BackupEdge[]) {
  const counts = new Map(Array.from(people, (p) => [p, 0]));
  const children = new Map<string, string[]>();
  const keys: string[] = [];
  for (const { person_a: a, person_b: b, type } of edges) {
    if (a === b || !people.has(a) || !people.has(b)) throw bad();
    const pair = type === "marriage" ? [a, b].sort() : [a, b];
    keys.push([type, ...pair].join("/"));
    if (type === "marriage") continue;
    counts.set(b, counts.get(b)! + 1);
    const list = children.get(a) ?? [];
    list.push(b);
    children.set(a, list);
  }
  unique(keys);
  const queue = [...people].filter((p) => !counts.get(p));
  for (let i = 0; i < queue.length; i++)
    for (const child of children.get(queue[i]) ?? []) {
      const remaining = counts.get(child)! - 1;
      counts.set(child, remaining);
      if (!remaining) queue.push(child);
    }
  if (queue.length !== people.size) throw bad();
}

export function parseBackup(input: unknown) {
  const file = record(input);
  const version = file.version === undefined ? 1 : file.version;
  if (typeof version !== "number" || ![1, 2, 3, 4].includes(version))
    throw bad();
  const allowed = new Set([
    "version",
    "timestamp",
    ...Object.keys(backupFields),
  ]);
  if (version === 4 && Object.keys(file).some((k) => !allowed.has(k)))
    throw bad();
  if (
    file.timestamp !== undefined &&
    (typeof file.timestamp !== "string" ||
      !Number.isFinite(Date.parse(file.timestamp)))
  )
    throw bad();
  const rows = (key: keyof typeof backupFields, legacyOptional = false) => {
    const v = file[key];
    if (v === undefined && legacyOptional && version < 4) return [];
    if (!Array.isArray(v)) throw bad();
    const parsed = v.map(record);
    if (
      version === 4 &&
      parsed.some((row) =>
        Object.keys(row).some((k) => !backupFields[key].includes(k)),
      )
    )
      throw bad();
    return parsed;
  };
  const persons = rows("persons").map((p): BackupPerson => {
    const gender = p.gender;
    if (gender !== "male" && gender !== "female" && gender !== "other")
      throw bad();
    const email = text(p.email)?.trim().toLowerCase() || null;
    if (
      email &&
      (email.length > 512 || email.lastIndexOf("@") < 1 || email.endsWith("@"))
    )
      throw bad();
    const person = {
      id: id(p.id),
      full_name: required(p.full_name),
      gender,
      email,
      other_names: text(p.other_names),
      note: text(p.note),
      birth_year: integer(p.birth_year),
      birth_month: integer(p.birth_month),
      birth_day: integer(p.birth_day),
      death_year: integer(p.death_year),
      death_month: integer(p.death_month),
      death_day: integer(p.death_day),
      death_lunar_year: integer(p.death_lunar_year),
      death_lunar_month: integer(p.death_lunar_month),
      death_lunar_day: integer(p.death_lunar_day),
      is_deceased: bool(p.is_deceased),
      is_in_law: bool(p.is_in_law) ?? false,
      birth_order: integer(p.birth_order),
      generation: integer(p.generation),
      avatar_url: text(p.avatar_url),
    } satisfies BackupPerson;
    person.death_lunar_month = validateLifeDates(person);
    return person;
  });
  if (version < 4 && !persons.length) throw bad();
  const personIds = new Set(persons.map((p) => p.id));
  if (personIds.size !== persons.length) throw bad();
  unique(persons.flatMap((p) => (p.email ? [p.email] : [])));
  const relationships = rows("relationships").map((r): BackupEdge => {
    if (
      r.type !== "marriage" &&
      r.type !== "biological_child" &&
      r.type !== "adopted_child"
    )
      throw bad();
    return {
      id: r.id == null && version < 4 ? crypto.randomUUID() : id(r.id),
      type: r.type,
      person_a: id(r.person_a),
      person_b: id(r.person_b),
      note: text(r.note),
    };
  });
  validateGraph(personIds, relationships);
  const person_details_private = rows("person_details_private", true).map(
    (p) => ({
      person_id: id(p.person_id),
      phone_number: text(p.phone_number),
      occupation: text(p.occupation),
      current_residence: text(p.current_residence),
    }),
  );
  unique(person_details_private.map((p) => p.person_id));
  if (person_details_private.some((p) => !personIds.has(p.person_id)))
    throw bad();
  const custom_events = rows("custom_events", true).map((e) => ({
    id: id(e.id),
    name: required(e.name),
    content: text(e.content),
    event_date:
      version < 4 ? legacyEventDate(e.event_date) : date(e.event_date),
    location: text(e.location),
  }));
  const gallery_items = rows("gallery_items", true).map((g) => ({
    id: id(g.id),
    title: required(g.title),
    description: text(g.description),
    event_date: g.event_date == null ? null : date(g.event_date),
    image_url: text(g.image_url),
  }));
  for (const collection of [relationships, custom_events, gallery_items])
    unique(collection.map((row) => row.id));
  return {
    persons,
    relationships,
    person_details_private,
    custom_events,
    gallery_items,
    replaceGallery: version === 4 || file.gallery_items !== undefined,
  };
}
