import { z } from "zod";
import { uuid } from "@/utils/family/records";

const id = z.string().length(36).regex(uuid);
const text = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[^\0]*$/);
const title = text(500).trim().min(1);
const note = text(8192).nullable().optional();
const image = text(2048).startsWith("/api/storage/");
const date = z.iso.date().refine((s) => !s.startsWith("0000"));
const integer = z.int32().nullable().optional();
const personFields = {
  full_name: title,
  gender: z.enum(["male", "female", "other"]).nullable().optional(),
  note,
  other_names: text(500).nullable().optional(),
  avatar_url: z
    .union([image, z.literal("")])
    .nullable()
    .optional(),
  birth_year: integer,
  birth_month: integer,
  birth_day: integer,
  death_year: integer,
  death_month: integer,
  death_day: integer,
  death_lunar_year: integer,
  death_lunar_month: integer,
  death_lunar_day: integer,
  generation: integer,
  birth_order: integer,
  is_in_law: z.boolean().optional(),
  is_deceased: z.boolean().nullable().optional(),
  email: text(320).nullable().optional(),
  phone_number: text(100).nullable().optional(),
  occupation: text(500).nullable().optional(),
  current_residence: text(500).nullable().optional(),
};
const eventFields = {
  name: title,
  event_date: date,
  location: text(500).nullable().optional(),
  content: note,
};
const nonempty = (obj: object) => Object.keys(obj).length > 0;
export const personCreate = z.strictObject(personFields);
export const personUpdate = personCreate.partial().refine(nonempty);
export const edgeCreate = z.strictObject({
  person_a: id,
  person_b: id,
  type: z.enum(["marriage", "biological_child", "adopted_child"]),
  note,
});
export const eventCreate = z.strictObject(eventFields);
export const eventUpdate = eventCreate.partial().refine(nonempty);
export const galleryCreate = z.strictObject({
  title,
  image_url: image,
  description: note,
  event_date: date.nullable().optional(),
});
const tree = z.strictObject({ familyTreeId: id });
const item = tree.extend({ id });
const page = z.strictObject({
  limit: z.int().min(1).max(100).optional(),
  offset: z.int().min(0).max(2147483647).optional(),
});
const treePage = tree.extend(page.shape);
export const toolInputs = {
  list_family_trees: page,
  list_people: treePage,
  get_person: item,
  create_person: tree.extend({ body: personCreate }),
  update_person: item.extend({ body: personUpdate }),
  delete_person: item,
  list_relationships: treePage,
  create_relationship: tree.extend({ body: edgeCreate }),
  delete_relationship: item,
  list_events: treePage,
  create_event: tree.extend({ body: eventCreate }),
  update_event: item.extend({ body: eventUpdate }),
  delete_event: item,
  list_gallery: treePage,
  create_gallery_item: tree.extend({ body: galleryCreate }),
  delete_gallery_item: item,
  get_family_stats: tree,
  export_family_data: tree,
};
