"use server";

import { getIsAdmin, getDataClient } from "@/utils/data/queries";
import { query } from "@/utils/db/client";
import { revalidatePath } from "next/cache";

// ─── Types ────────────────────────────────────────────────────────────────────
// ... (types remain the same)
interface PersonExport {
  id: string;
  full_name: string;
  gender: "male" | "female" | "other";
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
  death_year: number | null;
  death_month: number | null;
  death_day: number | null;
  death_lunar_year: number | null;
  death_lunar_month: number | null;
  death_lunar_day: number | null;
  is_deceased: boolean;
  is_in_law: boolean;
  birth_order: number | null;
  generation: number | null;
  other_names: string | null;
  avatar_url: string | null;
  note: string | null;
  // DB-managed fields (kept in export for traceability, stripped on import)
  created_at?: string;
  updated_at?: string;
}

interface RelationshipExport {
  id?: string;
  type: string;
  person_a: string;
  person_b: string;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface PersonDetailsPrivateExport {
  person_id: string;
  phone_number: string | null;
  occupation: string | null;
  current_residence: string | null;
}

interface CustomEventExport {
  id: string;
  name: string;
  content: string | null;
  event_date: string;
  location: string | null;
  created_by: string | null;
}

interface BackupPayload {
  version: number;
  timestamp: string;
  persons: PersonExport[];
  relationships: RelationshipExport[];
  person_details_private?: PersonDetailsPrivateExport[];
  custom_events?: CustomEventExport[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Các field được phép insert vào bảng persons (loại bỏ created_at/updated_at)
function sanitizePerson(
  p: PersonExport,
): Omit<PersonExport, "created_at" | "updated_at"> {
  return {
    id: p.id,
    full_name: p.full_name,
    gender: p.gender,
    birth_year: p.birth_year ?? null,
    birth_month: p.birth_month ?? null,
    birth_day: p.birth_day ?? null,
    death_year: p.death_year ?? null,
    death_month: p.death_month ?? null,
    death_day: p.death_day ?? null,
    death_lunar_year: p.death_lunar_year ?? null,
    death_lunar_month: p.death_lunar_month ?? null,
    death_lunar_day: p.death_lunar_day ?? null,
    is_deceased: p.is_deceased ?? false,
    is_in_law: p.is_in_law ?? false,
    birth_order: p.birth_order ?? null,
    generation: p.generation ?? null,
    other_names: p.other_names ?? null,
    avatar_url: p.avatar_url ?? null,
    note: p.note ?? null,
  };
}

function sanitizeRelationship(
  r: RelationshipExport,
): Omit<RelationshipExport, "id" | "created_at" | "updated_at"> {
  return {
    type: r.type,
    person_a: r.person_a,
    person_b: r.person_b,
    note: r.note ?? null,
  };
}

function sanitizeCustomEvent(
  e: CustomEventExport,
): Omit<CustomEventExport, "created_by"> {
  return {
    id: e.id,
    name: e.name,
    content: e.content ?? null,
    event_date: e.event_date,
    location: e.location ?? null,
  };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function saveCustomEvent(data: { id?: string; name: string; event_date: string; location: string | null; content: string | null }) {
  const isAdmin = await getIsAdmin();
  if (!isAdmin) return { error: "Từ chối truy cập." };

  const db = getDataClient();
  try {
    if (data.id) {
      const { error } = await db.from("custom_events").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("custom_events").insert(data);
      if (error) throw new Error(error.message);
    }
    revalidatePath("/dashboard/events");
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

export async function deleteCustomEvent(id: string) {
  const isAdmin = await getIsAdmin();
  if (!isAdmin) return { error: "Từ chối truy cập." };

  const db = getDataClient();
  try {
    const { error } = await db.from("custom_events").delete().eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/events");
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

export async function exportData(
  exportRootId?: string,
): Promise<BackupPayload | { error: string }> {
  const isAdmin = await getIsAdmin();
  if (!isAdmin) {
    return { error: "Từ chối truy cập. Chỉ admin mới có quyền này." };
  }

  const db = getDataClient();

  try {
    const [personsRes, relsRes, privateRes, eventsRes] = await Promise.all([
      db.from("persons").select("*").order("created_at", { ascending: true }),
      db
        .from("relationships")
        .select("*")
        .order("created_at", { ascending: true }),
      db
        .from("person_details_private")
        .select("*")
        .order("person_id", { ascending: true }),
      db
        .from("custom_events")
        .select("*")
        .order("event_date", { ascending: true }),
    ]);

    if (personsRes.error) throw new Error(personsRes.error.message);
    if (relsRes.error) throw new Error(relsRes.error.message);
    if (privateRes.error) throw new Error(privateRes.error.message);
    if (eventsRes.error) throw new Error(eventsRes.error.message);

    let exportPersons = personsRes.data as PersonExport[];
    let exportRels = relsRes.data as RelationshipExport[];
    let exportPrivateDetails = privateRes.data as PersonDetailsPrivateExport[];
    const exportCustomEvents = eventsRes.data as CustomEventExport[];

    // If a root person is selected, filter the export to only their subtree
    if (exportRootId && exportPersons.some((p) => p.id === exportRootId)) {
      const includedPersonIds = new Set<string>([exportRootId]);

      // Pre-calculate adjacency lists for O(1) lookup to improve performance with large datasets
      const childrenMap = new Map<string, string[]>();
      const spouseMap = new Map<string, string[]>();

      exportRels.forEach((r) => {
        if (r.type === "biological_child" || r.type === "adopted_child") {
          if (!childrenMap.has(r.person_a)) childrenMap.set(r.person_a, []);
          childrenMap.get(r.person_a)!.push(r.person_b);
        } else if (r.type === "marriage") {
          if (!spouseMap.has(r.person_a)) spouseMap.set(r.person_a, []);
          if (!spouseMap.has(r.person_b)) spouseMap.set(r.person_b, []);
          spouseMap.get(r.person_a)!.push(r.person_b);
          spouseMap.get(r.person_b)!.push(r.person_a);
        }
      });

      // 1. Traverse biological and adopted children recursively
      const findDescendants = (parentId: string) => {
        const children = childrenMap.get(parentId) || [];
        children.forEach((childId) => {
          if (!includedPersonIds.has(childId)) {
            includedPersonIds.add(childId);
            findDescendants(childId);
          }
        });
      };
      findDescendants(exportRootId);

      // 2. Add spouses for everyone in the tree so far
      const descendantsArray = Array.from(includedPersonIds); // snapshot current members
      descendantsArray.forEach((personId) => {
        const spouses = spouseMap.get(personId) || [];
        spouses.forEach((spouseId) => {
          includedPersonIds.add(spouseId);
        });
      });

      // 3. Filter the payload
      exportPersons = exportPersons.filter((p) => includedPersonIds.has(p.id));
      exportRels = exportRels.filter(
        (r) =>
          includedPersonIds.has(r.person_a) && includedPersonIds.has(r.person_b),
      );
      exportPrivateDetails = exportPrivateDetails.filter((d) =>
        includedPersonIds.has(d.person_id),
      );
      // custom_events are not person-scoped, so export all when subtree is selected
    }

    return {
      version: 3, // v3: adds death_lunar_*, person_details_private, relationship note, custom_events
      timestamp: new Date().toISOString(),
      persons: exportPersons,
      relationships: exportRels,
      person_details_private: exportPrivateDetails,
      custom_events: exportCustomEvents,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: "Lỗi tải dữ liệu: " + message };
  }
}

// ─── Import ───────────────────────────────────────────────────────────────────

export async function importData(importPayload: BackupPayload) {
  const isAdmin = await getIsAdmin();
  if (!isAdmin) {
    return { error: "Từ chối truy cập. Chỉ admin mới có quyền này." };
  }

  if (!importPayload?.persons || !importPayload?.relationships) {
    return { error: "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại file JSON." };
  }

  if (importPayload.persons.length === 0) {
    return {
      error: "File backup trống — không có thành viên nào để phục hồi.",
    };
  }

  const db = getDataClient();

  try {
    // 1-4. Bulk delete existing data using direct SQL for efficiency
    // The order respects FK constraints
    await query("DELETE FROM custom_events");
    await query("DELETE FROM relationships");
    await query("DELETE FROM person_details_private");
    await query("DELETE FROM persons");

    const CHUNK = 200;

    // 5. Insert persons (sanitized — chỉ giữ các field schema hiện tại)
    const persons = importPayload.persons.map(sanitizePerson);
    for (let i = 0; i < persons.length; i += CHUNK) {
      const chunk = persons.slice(i, i + CHUNK);
      const { error } = await db.from("persons").insert(chunk);
      if (error) throw new Error(`Lỗi khi import persons: ${error.message}`);
    }

    // 6. Insert relationships (stripped of id/created_at to avoid conflicts)
    // Filter out self-relationships to avoid "no_self_relationship" constraint violation
    const relationships = importPayload.relationships
      .filter((r: RelationshipExport) => r.person_a !== r.person_b)
      .map(sanitizeRelationship);

    for (let i = 0; i < relationships.length; i += CHUNK) {
      const chunk = relationships.slice(i, i + CHUNK);
      const { error } = await db.from("relationships").insert(chunk);
      if (error)
        throw new Error(`Lỗi khi import relationships: ${error.message}`);
    }

    // 7. Insert person_details_private (if present in payload)
    const privateDetails = importPayload.person_details_private ?? [];
    if (privateDetails.length > 0) {
      for (let i = 0; i < privateDetails.length; i += CHUNK) {
        const chunk = privateDetails.slice(i, i + CHUNK);
        const { error } = await db.from("person_details_private").insert(chunk);
        if (error)
          throw new Error(`Lỗi khi import private details: ${error.message}`);
      }
    }

    // 8. Insert custom_events (if present in payload, strip created_by)
    const customEvents = (importPayload.custom_events ?? []).map(
      sanitizeCustomEvent,
    );
    if (customEvents.length > 0) {
      for (let i = 0; i < customEvents.length; i += CHUNK) {
        const chunk = customEvents.slice(i, i + CHUNK);
        const { error } = await db.from("custom_events").insert(chunk);
        if (error)
          throw new Error(`Lỗi khi import custom events: ${error.message}`);
      }
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/members");
    revalidatePath("/dashboard/data");

    return {
      success: true,
      imported: {
        persons: persons.length,
        relationships: relationships.length,
        person_details_private: privateDetails.length,
        custom_events: customEvents.length,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}
