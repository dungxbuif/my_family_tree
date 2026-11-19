import type { PoolClient } from "pg";
import type { Person, RelationshipType } from "@/types";
import { FamilyDataError, publicColumns, requirePerson } from "./records";

export type Edge = {
  person_a: string;
  person_b: string;
  type: RelationshipType;
  note?: string | null;
};
export interface EnrichedRelationship {
  id: string;
  type: RelationshipType;
  direction: "parent" | "child" | "spouse" | "child_in_law";
  targetPerson: Person;
  note: string | null;
}

export async function insertEdge(client: PoolClient, tree: string, edge: Edge) {
  const { person_a: a, person_b: b, type } = edge;
  if (a === b)
    throw new FamilyDataError("Không thể tạo quan hệ với chính mình.");
  if (!["marriage", "biological_child", "adopted_child"].includes(type))
    throw new FamilyDataError("Quan hệ không hợp lệ.");
  await requirePerson(client, tree, a);
  await requirePerson(client, tree, b);
  const duplicate = await client.query(
    `SELECT FROM relationships WHERE tree_id=$1 AND type=$4
    AND ((person_a=$2 AND person_b=$3) OR (type='marriage' AND person_a=$3 AND person_b=$2))`,
    [tree, a, b, type],
  );
  if (duplicate.rowCount) throw new FamilyDataError("Quan hệ này đã tồn tại.");
  if (type !== "marriage") {
    const cycle = await client.query(
      `WITH RECURSIVE descendants(id) AS (
      SELECT $2::uuid UNION SELECT r.person_b FROM relationships r JOIN descendants d ON d.id=r.person_a
      WHERE r.tree_id=$1 AND r.type<>'marriage') SELECT FROM descendants WHERE id=$3`,
      [tree, b, a],
    );
    if (cycle.rowCount) throw new FamilyDataError("Quan hệ này tạo vòng lặp.");
  }
  await client.query(
    "INSERT INTO relationships(tree_id,person_a,person_b,type,note) VALUES($1,$2,$3,$4,$5)",
    [tree, a, b, type, edge.note ?? null],
  );
}

export async function readFamily(client: PoolClient, tree: string, id: string) {
  await requirePerson(client, tree, id);
  const { rows: relationships } = await client.query<EnrichedRelationship>(
    `WITH people AS (
    SELECT ${publicColumns} FROM persons WHERE tree_id=$1)
    SELECT r.id,r.type,CASE WHEN r.type='marriage' THEN 'spouse' WHEN r.person_a=$2 THEN 'child' ELSE 'parent' END direction,
      row_to_json(p) AS "targetPerson",r.note FROM relationships r JOIN people p ON p.id=CASE WHEN r.person_a=$2 THEN r.person_b ELSE r.person_a END
    WHERE r.tree_id=$1 AND $2 IN (r.person_a,r.person_b) ORDER BY r.id`,
    [tree, id],
  );
  const children = relationships.filter((r) => r.direction === "child");
  const childNames = new Map(
    children.map((r) => [r.targetPerson.id, r.targetPerson.full_name]),
  );
  const stats = {
    biologicalChildren: 0,
    maleBiologicalChildren: 0,
    femaleBiologicalChildren: 0,
    paternalGrandchildren: 0,
    maternalGrandchildren: 0,
    sonInLaw: 0,
    daughterInLaw: 0,
  };
  if (children.length) {
    const { rows } = await client.query<{
      id: string;
      child: string;
      targetPerson: Person;
      note: string | null;
    }>(
      `WITH people AS (
      SELECT ${publicColumns} FROM persons WHERE tree_id=$1), marriages AS (
      SELECT r.*, CASE WHEN person_a=ANY($2::uuid[]) THEN person_a ELSE person_b END child
      FROM relationships r WHERE tree_id=$1 AND type='marriage' AND (person_a=ANY($2) OR person_b=ANY($2)))
      SELECT r.id,r.child,r.note,row_to_json(p) AS "targetPerson" FROM marriages r JOIN people p
      ON p.id=CASE WHEN r.child=r.person_a THEN r.person_b ELSE r.person_a END`,
      [tree, [...childNames.keys()]],
    );
    for (const row of rows) {
      const name = childNames.get(row.child),
        gender = row.targetPerson.gender;
      const label =
        gender === "female"
          ? `Con dâu (vợ của ${name})`
          : gender === "male"
            ? `Con rể (chồng của ${name})`
            : `Vợ/chồng của ${name}`;
      relationships.push({
        id: row.id + "_inlaw",
        type: "marriage",
        direction: "child_in_law",
        targetPerson: row.targetPerson,
        note: row.note ? label + " - " + row.note : label,
      });
      if (gender === "female") stats.daughterInLaw++;
      if (gender === "male") stats.sonInLaw++;
    }
    const biological = children.filter((r) => r.type === "biological_child");
    const male = biological
      .filter((r) => r.targetPerson.gender === "male")
      .map((r) => r.targetPerson.id);
    const female = biological
      .filter((r) => r.targetPerson.gender === "female")
      .map((r) => r.targetPerson.id);
    const {
      rows: [counts],
    } = await client.query(
      `SELECT count(*) FILTER(WHERE person_a=ANY($2::uuid[]))::int paternal,
      count(*) FILTER(WHERE person_a=ANY($3::uuid[]))::int maternal FROM relationships WHERE tree_id=$1 AND type<>'marriage'
      AND (person_a=ANY($2) OR person_a=ANY($3))`,
      [tree, male, female],
    );
    Object.assign(stats, {
      biologicalChildren: biological.length,
      maleBiologicalChildren: male.length,
      femaleBiologicalChildren: female.length,
      paternalGrandchildren: counts.paternal,
      maternalGrandchildren: counts.maternal,
    });
  }
  return { relationships, stats };
}
