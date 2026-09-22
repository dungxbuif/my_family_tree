"use server";

import { getProfile, getDataClient } from "@/utils/data/queries";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Person } from "@/types";


export async function fetchMemberDetail(id: string) {
  const db = getDataClient();
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin";

  const { data: person, error: pError } = await db
    .from<Person>("persons")
    .select("*")
    .eq("id", id)
    .single();
  
  if (pError || !person) throw new Error("Không thể tải thông tin thành viên.");

  let privateData = null;
  if (isAdmin) {
    const { data } = await db
      .from<Record<string, unknown>>("person_details_private")
      .select("*")
      .eq("person_id", id)
      .single();
    privateData = data;
  }

  return { person, privateData };
}

export async function batchUpdateLineage(updates: { id: string; generation: number | null; birth_order: number | null; is_in_law: boolean }[]) {
  const profile = await getProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    return { error: "Từ chối truy cập." };
  }

  const db = getDataClient();
  try {
    for (const u of updates) {
      const { error } = await db.from("persons").update({
        generation: u.generation,
        birth_order: u.birth_order,
        is_in_law: u.is_in_law,
      }).eq("id", u.id);
      if (error) throw new Error(error.message);
    }
    revalidatePath("/dashboard/lineage");
    revalidatePath("/dashboard/members");
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

export async function getPersonSelectorList() {
  const db = getDataClient();
  const { data, error } = await db
    .from<Person>("persons")
    .select("id, full_name, birth_year, gender, avatar_url, generation")
    .order("birth_year", { ascending: true });
  
  if (error) throw new Error(error.message);
  return data || [];
}

export async function searchMembers(query: string, excludeId?: string) {
  const db = getDataClient();
  let builder = db
    .from<Person>("persons")
    .select("*")
    .ilike("full_name", `%${query}%`);
  
  if (excludeId) {
    builder = builder.neq("id", excludeId);
  }

  const { data, error } = await builder.limit(5);
  
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getRecentMembers(excludeId?: string, limit: number = 10) {
  const db = getDataClient();
  let builder = db
    .from<Person>("persons")
    .select("*")
    .order("created_at", { ascending: false });
  
  if (excludeId) {
    builder = builder.neq("id", excludeId);
  }

  const { data, error } = await builder.limit(limit);
  
  if (error) throw new Error(error.message);
  return data || [];
}

export async function saveMember(formData: FormData) {
  const profile = await getProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    return { error: "Từ chối truy cập." };
  }

  const db = getDataClient();
  const id = formData.get("id")?.toString();
  
  // Extract all person fields from formData
  const personData: Record<string, string | number | boolean | null> = {};
  const fields = [
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
    "note",
    "avatar_url",
  ];

  fields.forEach((field) => {
    const val = formData.get(field);
    if (val !== null) {
      if (field === "is_deceased" || field === "is_in_law") {
        personData[field] = val === "true";
      } else if (
        field.includes("_year") ||
        field.includes("_month") ||
        field.includes("_day") ||
        field === "birth_order" ||
        field === "generation"
      ) {
        personData[field] = val ? parseInt(val.toString()) : null;
      } else {
        personData[field] = val.toString();
      }
    }
  });

  try {
    // 1. Handle avatar upload
    let personId = id;

    // 2. Upsert person
    if (id) {
      const { error } = await db.from("persons").update(personData).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await db
        .from<{ id: string }>("persons")
        .insert(personData)
        .single();
      if (error) throw new Error(error.message);
      personId = data?.id;
    }

    // 3. Handle private details if admin
    if (profile.role === "admin" && personId) {
      const privateFields = ["phone_number", "occupation", "current_residence"];
      const privateData: Record<string, string | null> = { person_id: personId };
      privateFields.forEach((field) => {
        const val = formData.get(field);
        privateData[field] = val ? val.toString() : null;
      });

      const { error: privateError } = await db
        .from("person_details_private")
        .upsert(privateData);
      if (privateError) throw new Error(privateError.message);
    }

    revalidatePath("/dashboard/members");
    revalidatePath(`/dashboard/members/${personId}`);
    return { success: true, id: personId };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Save member error:", message);
    return { error: message };
  }
}

export async function deleteMemberProfile(memberId: string) {
  const profile = await getProfile();
  const db = getDataClient();

  if (profile?.role !== "admin" && profile?.role !== "editor") {
    return {
      error: "Từ chối truy cập. Chỉ Admin hoặc Editor mới có quyền xoá hồ sơ.",
    };
  }

  // 2. Check for existing relationships
  const { data: relationships, error: relationshipError } = await db
    .from("relationships")
    .select("id")
    .or(`person_a.eq.${memberId},person_b.eq.${memberId}`)
    .limit(1);

  if (relationshipError) {
    console.error("Error checking relationships:", relationshipError);
    return { error: "Lỗi kiểm tra mối quan hệ gia đình." };
  }

  if (relationships && (relationships as { id: string }[]).length > 0) {
    return {
      error:
        "Không thể xoá. Vui lòng xoá hết các mối quan hệ gia đình của người này trước.",
    };
  }

  // 3. Delete the member
  const { error: deleteError } = await db
    .from("persons")
    .delete()
    .eq("id", memberId);

  if (deleteError) {
    console.error("Error deleting person:", deleteError);
    return { error: "Đã xảy ra lỗi khi xoá hồ sơ." };
  }

  // 4. Revalidate and redirect
  revalidatePath("/dashboard/members");
  redirect("/dashboard/members");
}
