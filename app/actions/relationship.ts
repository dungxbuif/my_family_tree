"use server";

import { revalidatePath } from "next/cache";
import { getDataClient, getProfile } from "@/utils/data/queries";
import { RelationshipType, Person, Relationship } from "@/types";

export interface EnrichedRelationship {
  id: string;
  type: RelationshipType;
  direction: "parent" | "child" | "spouse" | "child_in_law";
  targetPerson: Person;
  note: string | null;
}

interface RelationshipWithTarget extends Relationship {
  target: Person;
}

interface MarriageWithPersons extends Relationship {
  person_a_data: Person;
  person_b_data: Person;
}

export async function fetchMemberRelationships(personId: string): Promise<EnrichedRelationship[]> {
  const db = getDataClient();
  
  // Get all relationships where this person involved
  const { data: relsA, error: errA } = await db
    .from("relationships")
    .select(`*, target:persons!person_b(*)`)
    .eq("person_a", personId);

  const { data: relsB, error: errB } = await db
    .from("relationships")
    .select(`*, target:persons!person_a(*)`)
    .eq("person_b", personId);

  if (errA || errB) throw new Error((errA || errB)?.message || "Unknown error fetching relationships");

  const formattedRels: EnrichedRelationship[] = [];

  (relsA as RelationshipWithTarget[] | null)?.forEach((r) => {
    let direction: "parent" | "child" | "spouse" = "spouse";
    if (r.type === "marriage") direction = "spouse";
    else if (r.type === "biological_child" || r.type === "adopted_child")
      direction = "child";

    formattedRels.push({
      id: r.id,
      type: r.type,
      direction,
      targetPerson: r.target,
      note: r.note || null,
    });
  });

  (relsB as RelationshipWithTarget[] | null)?.forEach((r) => {
    let direction: "parent" | "child" | "spouse" = "spouse";
    if (r.type === "marriage") direction = "spouse";
    else if (r.type === "biological_child" || r.type === "adopted_child")
      direction = "parent";

    formattedRels.push({
      id: r.id,
      type: r.type,
      direction,
      targetPerson: r.target,
      note: r.note || null,
    });
  });

  // Fetch in-laws (spouses of children)
  const childrenIds = formattedRels
    .filter((r) => r.direction === "child")
    .map((r) => r.targetPerson.id);

  if (childrenIds.length > 0) {
    // We need to find marriages where person_a is a child OR person_b is a child
    // Since table-client's .or() is limited, we'll do two queries
    const { data: marriagesA } = await db
      .from("relationships")
      .select(`*, person_a_data:persons!person_a(*), person_b_data:persons!person_b(*)`)
      .eq("type", "marriage")
      .in("person_a", childrenIds) as { data: MarriageWithPersons[] | null };

    const { data: marriagesB } = await db
      .from("relationships")
      .select(`*, person_a_data:persons!person_a(*), person_b_data:persons!person_b(*)`)
      .eq("type", "marriage")
      .in("person_b", childrenIds) as { data: MarriageWithPersons[] | null };

    const childrenMarriages = [...(marriagesA || []), ...(marriagesB || [])];
    
    // Remove duplicates if any (though a marriage should only have one of the children if they are not married to each other)
    const seenIds = new Set<string>();
    const uniqueMarriages = childrenMarriages.filter(m => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });

    (uniqueMarriages as MarriageWithPersons[]).forEach((m) => {
      const isAChild = childrenIds.includes(m.person_a);
      const childPerson = isAChild ? m.person_a_data : m.person_b_data;
      const spousePerson = isAChild ? m.person_b_data : m.person_a_data;

      if (spousePerson && childPerson) {
        const spouseGender = spousePerson.gender;
        let noteLabel = `Vợ/chồng của ${childPerson.full_name}`;
        if (spouseGender === "female")
          noteLabel = `Con dâu (vợ của ${childPerson.full_name})`;
        if (spouseGender === "male")
          noteLabel = `Con rể (chồng của ${childPerson.full_name})`;

        // Append existing marriage note if any
        if (m.note) noteLabel += ` - ${m.note}`;

        formattedRels.push({
          id: m.id + "_inlaw",
          type: "marriage",
          direction: "child_in_law",
          targetPerson: spousePerson,
          note: noteLabel,
        });
      }
    });
  }

  return formattedRels;
}

export async function getRelationshipStats(personId: string, relationships: EnrichedRelationship[]) {
  const db = getDataClient();
  
  const biologicalChildrenList = relationships.filter(
    (r) => r.direction === "child" && r.type === "biological_child",
  );
  const biologicalChildren = biologicalChildrenList.length;
  const maleBiologicalChildren = biologicalChildrenList.filter(
    (c) => c.targetPerson.gender === "male",
  ).length;
  const femaleBiologicalChildren = biologicalChildrenList.filter(
    (c) => c.targetPerson.gender === "female",
  ).length;

  const daughterInLaw = relationships.filter(
    (r) =>
      r.direction === "child_in_law" &&
      r.targetPerson.gender === "female",
  ).length;
  const sonInLaw = relationships.filter(
    (r) =>
      r.direction === "child_in_law" && r.targetPerson.gender === "male",
  ).length;

  const childrenIds = biologicalChildrenList.map(r => r.targetPerson.id);

  // Fetch Grandchildren mapping
  let paternalGrandchildren = 0;
  let maternalGrandchildren = 0;
  
  if (childrenIds.length > 0) {
    const { data: grandchildrenData } = await db
      .from("relationships")
      .select("id, person_a")
      .in("type", ["biological_child", "adopted_child"])
      .in("person_a", childrenIds);

    if (grandchildrenData) {
      const maleChildrenIds = biologicalChildrenList
        .filter((r) => r.targetPerson.gender === "male")
        .map((r) => r.targetPerson.id);
      const femaleChildrenIds = biologicalChildrenList
        .filter((r) => r.targetPerson.gender === "female")
        .map((r) => r.targetPerson.id);

      paternalGrandchildren = (grandchildrenData as { person_a: string }[]).filter((g) =>
        maleChildrenIds.includes(g.person_a),
      ).length;
      maternalGrandchildren = (grandchildrenData as { person_a: string }[]).filter((g) =>
        femaleChildrenIds.includes(g.person_a),
      ).length;
    }
  }

  return {
    biologicalChildren,
    maleBiologicalChildren,
    femaleBiologicalChildren,
    paternalGrandchildren,
    maternalGrandchildren,
    sonInLaw,
    daughterInLaw,
  };
}

export async function addRelationship(data: {
  person_a: string;
  person_b: string;
  type: RelationshipType;
  note: string | null;
  direction?: "parent" | "child" | "spouse"; // Used for auto-updating target person
  personGeneration?: number | null;
  personIsInLaw?: boolean | null;
}) {
  const profile = await getProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    return { error: "Từ chối truy cập." };
  }

  const db = getDataClient();
  try {
    const { error } = await db.from("relationships").insert({
        person_a: data.person_a,
        person_b: data.person_b,
        type: data.type,
        note: data.note,
    });
    if (error) throw new Error(error.message);

    // Auto-update target person generation and is_in_law if currently missing
    if (data.direction) {
        const targetId = data.direction === "parent" ? data.person_a : data.person_b;
        const { data: targetPerson } = await db
            .from("persons")
            .select("generation, is_in_law")
            .eq("id", targetId)
            .single();

        if (targetPerson) {
            const tp = targetPerson as Partial<Person>;
            if (tp.generation == null || tp.is_in_law == null) {
                const updates: { generation?: number; is_in_law?: boolean } = {};

                if (tp.generation == null && data.personGeneration != null) {
                    if (data.direction === "child")
                        updates.generation = data.personGeneration + 1;
                    else if (data.direction === "parent")
                        updates.generation = data.personGeneration - 1;
                    else if (data.direction === "spouse")
                        updates.generation = data.personGeneration;
                }

                if (tp.is_in_law == null) {
                    if (data.direction === "child" || data.direction === "parent")
                        updates.is_in_law = false;
                    else if (data.direction === "spouse")
                        updates.is_in_law = data.personIsInLaw === true ? false : true;
                }

                if (Object.keys(updates).length > 0) {
                    await db.from("persons").update(updates).eq("id", targetId);
                }
            }
        }
    }

    revalidatePath("/dashboard/members/[id]", "page");
    return { success: true };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định" };
  }
}

export async function deleteRelationship(id: string) {
  const profile = await getProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    return { error: "Từ chối truy cập." };
  }

  const db = getDataClient();
  try {
    const { error } = await db.from("relationships").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/dashboard/members/[id]", "page");
    return { success: true };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định" };
  }
}

export async function quickAddSpouse(data: {
  personId: string;
  name: string;
  gender: "male" | "female" | "other";
  is_in_law: boolean;
  generation: number | null;
  birthYear?: number;
  note: string | null;
}) {
  const profile = await getProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    return { error: "Từ chối truy cập." };
  }

  const db = getDataClient();
  try {
    // 1. Insert Person
    const personPayload: Partial<Person> = {
      full_name: data.name,
      gender: data.gender,
      is_in_law: data.is_in_law,
      generation: data.generation,
    };
    if (data.birthYear) personPayload.birth_year = data.birthYear;

    const { data: newPerson, error: pError } = await db.from("persons").insert(personPayload).single();
    if (pError) throw new Error(pError.message);

    const newSpouseId = (newPerson as Person).id;

    // 2. Insert Relationship
    const { error: rError } = await db.from("relationships").insert({
      person_a: data.personId,
      person_b: newSpouseId,
      type: "marriage",
      note: data.note,
    });
    if (rError) throw new Error(rError.message);

    revalidatePath("/dashboard/members/[id]", "page");
    return { success: true };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định" };
  }
}

export async function bulkAddChildren(data: {
    parentId: string;
    spouseId?: string | null;
    parentGeneration: number | null;
    children: {
        name: string;
        gender: "male" | "female" | "other";
        birthYear: string;
        birthOrder: string;
    }[]
}) {
    const profile = await getProfile();
    if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
        return { error: "Từ chối truy cập." };
    }

    const db = getDataClient();
    let successCount = 0;

    try {
        for (const child of data.children) {
            // 1. Insert Person
            const personPayload: Partial<Person> = {
                full_name: child.name.trim(),
                gender: child.gender,
                is_in_law: false,
            };

            if (data.parentGeneration != null) {
                personPayload.generation = data.parentGeneration + 1;
            }
            if (child.birthYear.trim() !== "") {
                const year = parseInt(child.birthYear);
                if (!isNaN(year)) personPayload.birth_year = year;
            }
            if (child.birthOrder.trim() !== "") {
                const order = parseInt(child.birthOrder);
                if (!isNaN(order)) personPayload.birth_order = order;
            }

            const { data: newPerson, error: insertError } = await db
                .from("persons")
                .insert(personPayload)
                .single();

            if (insertError || !newPerson) {
                console.error("Error inserting child:", child.name, insertError);
                continue;
            }

            const newChildId = (newPerson as Person).id;

            // 2. Insert Relationship to Main Parent
            await db.from("relationships").insert({
                person_a: data.parentId,
                person_b: newChildId,
                type: "biological_child",
            });

            // 3. Insert Relationship to Second Parent (spouse), if selected
            if (data.spouseId && data.spouseId !== "unknown") {
                await db.from("relationships").insert({
                    person_a: data.spouseId,
                    person_b: newChildId,
                    type: "biological_child",
                });
            }

            successCount++;
        }

        revalidatePath("/dashboard/members/[id]", "page");
        revalidatePath("/dashboard/members", "page");
        
        return { success: true, count: successCount };
    } catch (error: unknown) {
        return { error: error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định" };
    }
}
