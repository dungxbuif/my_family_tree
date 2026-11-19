import { afterAll, afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createFamilyTree } from "@/utils/auth/tree-access";
import { familyPeople } from "@/utils/family/people";

const connectionString = process.env.FAMILY_TREE_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error(
    "Set FAMILY_TREE_TEST_DATABASE_URL to a migrated test database.",
  );
const db = new Pool({ connectionString });
const accounts: string[] = [],
  trees: string[] = [];
async function account() {
  const id = randomUUID();
  accounts.push(id);
  await db.query(
    `WITH u AS (INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture') RETURNING id)
    INSERT INTO profiles(id,is_active) SELECT id,true FROM u`,
    [id, id + "@example.test"],
  );
  return id;
}
async function tree(owner: string) {
  const { tree } = await createFamilyTree(owner, "Gia phả", db);
  trees.push(tree!.id);
  return tree!.id;
}
async function person(treeId: string) {
  const { rows } = await db.query(
    "INSERT INTO persons(tree_id,full_name,gender) VALUES($1,'An','other') RETURNING id",
    [treeId],
  );
  return rows[0].id as string;
}
afterEach(async () => {
  await db.query("DELETE FROM family_trees WHERE id=ANY($1::uuid[])", [
    trees.splice(0),
  ]);
  await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    accounts.splice(0),
  ]);
});
afterAll(() => db.end());

test("the graph, selectors, search, recent list and details share the active tree and its role", async () => {
  const owner = await account(),
    otherOwner = await account(),
    a = await tree(owner),
    b = await tree(otherOwner);
  const local = await person(a),
    foreign = await person(b);
  await db.query(
    "INSERT INTO person_details_private(tree_id,person_id,occupation) VALUES($1,$2,'Private')",
    [a, local],
  );
  await db.query(
    "INSERT INTO tree_memberships(tree_id,user_id,role) VALUES($1,$2,'viewer')",
    [a, otherOwner],
  );
  const current = familyPeople(otherOwner, a, db);
  expect((await current.graph()).persons.map((p) => p.id)).toEqual([local]);
  expect((await current.selector()).map((p) => p.id)).toEqual([local]);
  expect((await current.search("An")).map((p) => p.id)).toEqual([local]);
  expect((await current.recent()).map((p) => p.id)).toEqual([local]);
  expect((await current.detail(local))?.privateData).toBeNull();
  expect(
    (await familyPeople(owner, a, db).detail(local))?.privateData?.occupation,
  ).toBe("Private");
  for (const id of [foreign, randomUUID()])
    expect(await current.detail(id)).toBeNull();
  await db.query(
    "DELETE FROM tree_memberships WHERE tree_id=$1 AND user_id=$2",
    [a, otherOwner],
  );
  await expect(current.selector()).rejects.toThrow("Từ chối truy cập");
  await expect(current.graph()).rejects.toThrow("Từ chối truy cập");
});

function form(values: Record<string, string>) {
  const fields = new FormData();
  for (const [key, value] of Object.entries(values)) fields.set(key, value);
  return fields;
}
test("Person edits, private details, auto-link and delete use the selected tree's role", async () => {
  const owner = await account(),
    editor = await account(),
    target = await account();
  const a = await tree(owner),
    b = await tree(editor);
  await db.query(
    "INSERT INTO tree_memberships(tree_id,user_id,role) VALUES($1,$2,'editor'),($3,$4,'viewer')",
    [a, editor, b, owner],
  );
  const edit = familyPeople(editor, a, db),
    own = familyPeople(owner, a, db),
    view = familyPeople(owner, b, db);
  const fields = form({
    full_name: "An",
    gender: "other",
    submissionId: randomUUID(),
  });
  const id = await edit.save(fields);
  expect(await edit.save(fields)).toBe(id);
  expect((await edit.graph()).persons).toHaveLength(1);
  await expect(view.save(fields)).rejects.toThrow("Từ chối");
  const foreign = await person(b);
  for (const missing of [foreign, randomUUID()]) {
    await expect(
      edit.save(form({ id: missing, full_name: "Khác" })),
    ).rejects.toThrow("Không tìm thấy");
    await expect(edit.remove(missing)).rejects.toThrow("Không tìm thấy");
  }
  await expect(
    edit.save(form({ id, phone_number: "private" })),
  ).rejects.toThrow("Từ chối");
  await expect(
    edit.save(form({ id, email: target + "@example.test" })),
  ).rejects.toThrow("Từ chối");
  await own.save(
    form({
      id,
      email: target + "@example.test",
      occupation: "Nghề",
      full_name: "Bình",
    }),
  );
  await own.save(form({ id, email: editor + "@example.test" }));
  expect(
    (
      await db.query(
        "SELECT linked_user_id,full_name FROM persons WHERE id=$1",
        [id],
      )
    ).rows[0],
  ).toEqual({ linked_user_id: target, full_name: "Bình" });
  expect((await own.detail(id))?.privateData?.occupation).toBe("Nghề");
  expect((await edit.detail(id))?.person.email).toBeUndefined();
  await expect(edit.remove(id)).rejects.toThrow("liên kết");
  await expect(view.remove(foreign)).rejects.toThrow("Từ chối");
  const disposable = await person(a);
  await edit.remove(disposable);
  expect(await own.detail(disposable)).toBeNull();
});

test("contextual creation and relationship, bulk and lineage changes commit only as a unit", async () => {
  const owner = await account(),
    a = await tree(owner),
    b = await tree(owner);
  const local = await person(a),
    foreign = await person(b);
  const service = familyPeople(owner, a, db);
  const context = {
    full_name: "Con",
    gender: "other",
    relatedTo: local,
    relation: "child",
    submissionId: randomUUID(),
  };
  for (const missing of [foreign, randomUUID()]) {
    await expect(
      service.save(form({ ...context, relatedTo: missing })),
    ).rejects.toThrow("Không tìm thấy");
    await expect(
      service.addEdge({ person_a: local, person_b: missing, type: "marriage" }),
    ).rejects.toThrow("Không tìm thấy");
    await expect(service.removeEdge(missing)).rejects.toThrow("Không tìm thấy");
    await expect(
      service.family(local).then(() => service.family(missing)),
    ).rejects.toThrow("Không tìm thấy");
    await expect(
      service.lineage(
        [local, missing].map((id) => ({
          id,
          generation: 9,
          birth_order: 1,
          is_in_law: false,
        })),
      ),
    ).rejects.toThrow("Không tìm thấy");
  }
  expect((await service.detail(local))?.person.generation).toBeNull();
  expect((await service.graph()).persons).toHaveLength(1);
  const child = await service.save(form(context));
  const family = await service.family(local);
  expect(
    family.relationships.map((r) => [r.direction, r.targetPerson.id]),
  ).toEqual([["child", child]]);
  expect(family.stats.biologicalChildren).toBe(1);
  await expect(
    service.addEdge({
      person_a: child,
      person_b: local,
      type: "adopted_child",
    }),
  ).rejects.toThrow("vòng");
  await expect(
    service.addEdge({ person_a: local, person_b: local, type: "marriage" }),
  ).rejects.toThrow("chính");
  const spouse = await person(a);
  const add = (reverse: boolean) =>
    service.addEdge({
      person_a: reverse ? spouse : local,
      person_b: reverse ? local : spouse,
      type: "marriage",
    });
  const concurrent = await Promise.allSettled([add(false), add(true)]);
  expect(concurrent.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  await expect(service.remove(local)).rejects.toThrow("quan hệ");
  const foreignEdge = await db.query(
    "INSERT INTO relationships(tree_id,person_a,person_b,type) VALUES($1,$2,$3,'marriage') RETURNING id",
    [b, foreign, await person(b)],
  );
  await expect(service.removeEdge(foreignEdge.rows[0].id)).rejects.toThrow(
    "Không tìm thấy",
  );
  await service.removeEdge(family.relationships[0].id);
  expect((await service.family(local)).stats.biologicalChildren).toBe(0);
});

test("bulk creation rejects an unavailable second parent, and simultaneous retries create each child once", async () => {
  const owner = await account(),
    a = await tree(owner),
    b = await tree(owner);
  const parent = await person(a),
    foreign = await person(b),
    service = familyPeople(owner, a, db);
  const draft = {
    parentId: parent,
    submissionId: randomUUID(),
    children: [
      {
        name: "Bình",
        gender: "other" as const,
        birthYear: "2000",
        birthOrder: "1",
      },
      {
        name: "Lan",
        gender: "female" as const,
        birthYear: "",
        birthOrder: "2",
      },
    ],
  };
  await expect(
    service.children({ ...draft, spouseId: foreign }),
  ).rejects.toThrow("Không tìm thấy");
  expect((await service.graph()).persons).toHaveLength(1);
  const [first, retry] = await Promise.all([
    service.children(draft),
    service.children(draft),
  ]);
  expect(first).toEqual(retry);
  expect((await service.family(parent)).stats.biologicalChildren).toBe(2);
});

test("a Viewer who is a Super Admin and owns another tree cannot mutate core data", async () => {
  const actor = await account(),
    owner = await account();
  await tree(actor);
  const current = await tree(owner),
    id = await person(current),
    other = await person(current);
  await db.query("UPDATE profiles SET is_super_admin=true WHERE id=$1", [
    actor,
  ]);
  await db.query(
    "INSERT INTO tree_memberships(tree_id,user_id,role) VALUES($1,$2,'viewer')",
    [current, actor],
  );
  const service = familyPeople(actor, current, db);
  const mutations = [
    () => service.save(form({ id, full_name: "Changed" })),
    () => service.save(form({ id, phone_number: "Private" })),
    () => service.save(form({ full_name: "New", submissionId: randomUUID() })),
    () => service.addEdge({ person_a: id, person_b: other, type: "marriage" }),
    () => service.removeEdge(randomUUID()),
    () => service.remove(id),
    () =>
      service.lineage([
        { id, generation: 9, birth_order: 1, is_in_law: false },
      ]),
    () =>
      service.children({
        parentId: id,
        children: [],
        submissionId: randomUUID(),
      }),
  ];
  for (const mutate of mutations)
    await expect(mutate()).rejects.toThrow("Từ chối");
  expect((await service.graph()).persons).toHaveLength(2);
  expect((await service.detail(id))?.person.full_name).toBe("An");
  await db.query("UPDATE profiles SET is_active=false WHERE id=$1", [actor]);
  await expect(service.detail(id)).rejects.toThrow("Từ chối");
});

test.skipIf(!process.env.FAMILY_TREE_TEST_APP_URL)(
  "rendered member routes use the selected tree even when the account owns another",
  async () => {
    const { createHash } = await import("node:crypto");
    const owner = await account(),
      viewer = await account(),
      a = await tree(owner),
      b = await tree(viewer);
    await db.query(
      "INSERT INTO tree_memberships(tree_id,user_id,role) VALUES($1,$2,'viewer')",
      [a, viewer],
    );
    const local = await person(a),
      foreign = await person(b),
      token = randomUUID(),
      privateText = randomUUID();
    await db.query(
      "UPDATE persons SET full_name='Foreign fixture marker' WHERE tree_id=$1",
      [b],
    );
    await db.query(
      "INSERT INTO person_details_private(tree_id,person_id,occupation) VALUES($1,$2,$3)",
      [a, local, privateText],
    );
    await db.query(
      "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes')",
      [viewer, createHash("sha256").update(token).digest("hex")],
    );
    async function html(path: string, treeId = a) {
      return (
        await fetch(process.env.FAMILY_TREE_TEST_APP_URL + path, {
          headers: {
            cookie: `family_tree_session=${token}; family_tree_selected=${treeId}`,
          },
        })
      ).text();
    }
    const list = await html("/dashboard/members?view=list");
    expect(list).not.toContain("Foreign fixture marker");
    expect(list).not.toContain(">Thêm thành viên<");
    const detail = await html("/dashboard/members/" + local);
    expect(detail).toContain("Hồ sơ thành viên");
    expect(detail).not.toContain(privateText);
    expect(detail).toContain("Tình trạng chưa rõ");
    expect(await html("/dashboard/members/" + foreign)).not.toContain(
      "Foreign fixture marker",
    );
    expect(await html("/dashboard/members/" + local + "/edit")).toContain(
      "Bạn không có quyền chỉnh sửa",
    );
    expect(await html("/dashboard/members/" + foreign, b)).toContain(
      "Foreign fixture marker",
    );
  },
);

test("a waiting Person edit rechecks the Editor's role after a demotion commits", async () => {
  const owner = await account(),
    editor = await account(),
    treeId = await tree(owner),
    id = await person(treeId);
  await db.query(
    "INSERT INTO tree_memberships(tree_id,user_id,role) VALUES($1,$2,'editor')",
    [treeId, editor],
  );
  const label = "person-edit-" + randomUUID();
  const writer = new Pool({
    connectionString,
    application_name: label,
    statement_timeout: 5000,
  });
  const client = await db.connect();
  let pending: Promise<string> | undefined;
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM family_trees WHERE id=$1 FOR UPDATE", [
      treeId,
    ]);
    await client.query(
      "UPDATE tree_memberships SET role='viewer' WHERE tree_id=$1 AND user_id=$2",
      [treeId, editor],
    );
    pending = familyPeople(editor, treeId, writer).save(
      form({ id, full_name: "Late edit" }),
    );
    pending.catch(() => {});
    let waiting = false;
    for (let attempt = 0; attempt < 80 && !waiting; attempt++) {
      const { rowCount } = await db.query(
        "SELECT FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",
        [label],
      );
      waiting = rowCount === 1;
      if (!waiting) await Bun.sleep(10);
    }
    expect(waiting).toBe(true);
    await client.query("COMMIT");
    await expect(pending).rejects.toThrow("Từ chối");
    expect(
      (await familyPeople(owner, treeId, db).detail(id))?.person.full_name,
    ).toBe("An");
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pending?.catch(() => {});
    await writer.end();
  }
});

test("an unavailable relationship context rolls back the new Person, contact fields, auto-link, membership and receipt", async () => {
  const owner = await account(),
    target = await account(),
    local = await tree(owner),
    other = await tree(owner);
  const foreign = await person(other),
    submissionId = randomUUID(),
    service = familyPeople(owner, local, db);
  const draft = {
    full_name: "Mai",
    gender: "female",
    email: target + "@example.test",
    phone_number: "123",
    relatedTo: foreign,
    relation: "parent",
    submissionId,
  };
  await expect(service.save(form(draft))).rejects.toThrow("Không tìm thấy");
  expect((await service.graph()).persons).toHaveLength(0);
  expect(
    (
      await db.query(
        "SELECT FROM tree_memberships WHERE tree_id=$1 AND user_id=$2",
        [local, target],
      )
    ).rowCount,
  ).toBe(0);
  expect(
    (
      await db.query("SELECT FROM person_details_private WHERE tree_id=$1", [
        local,
      ])
    ).rowCount,
  ).toBe(0);
  expect(
    (
      await db.query(
        "SELECT FROM person_creation_receipts WHERE tree_id=$1 AND submission_id=$2",
        [local, submissionId],
      )
    ).rowCount,
  ).toBe(0);
  const child = await person(local);
  const id = await service.save(form({ ...draft, relatedTo: child }));
  expect((await service.family(child)).relationships[0]).toMatchObject({
    direction: "parent",
    targetPerson: { id },
  });
  expect((await service.detail(id))?.privateData?.phone_number).toBe("123");
  expect(
    (
      await db.query(
        "SELECT role FROM tree_memberships WHERE tree_id=$1 AND user_id=$2",
        [local, target],
      )
    ).rows,
  ).toEqual([{ role: "viewer" }]);
});

test("life status distinguishes unknown, living and deceased in the stored Person", async () => {
  const owner = await account(),
    treeId = await tree(owner),
    service = familyPeople(owner, treeId, db);
  for (const [state, expected] of [
    ["unknown", null],
    ["true", true],
    ["false", false],
  ] as const) {
    const id = await service.save(
      form({
        full_name: state,
        is_deceased: state,
        submissionId: randomUUID(),
      }),
    );
    expect((await service.detail(id))?.person.is_deceased).toBe(expected);
  }
  const plain = await person(treeId);
  expect((await service.detail(plain))?.person.is_deceased).toBeNull();
});

test("calendar validation handles leap dates and partial updates at their recorded precision", async () => {
  const owner = await account(),
    treeId = await tree(owner),
    service = familyPeople(owner, treeId, db);
  const draft = {
    full_name: "Ngày sinh",
    birth_year: "2000",
    birth_month: "2",
    birth_day: "29",
    submissionId: randomUUID(),
  };
  const id = await service.save(form(draft));
  for (const changes of [
    { birth_month: "13" },
    { birth_day: "0" },
    { birth_year: "1900" },
    { birth_day: "30" },
    { death_year: "2000", death_month: "1" },
    { death_year: "2000", death_month: "2", death_day: "28" },
    { death_lunar_month: "13" },
    { death_lunar_day: "31" },
  ] as Record<string, string>[]) {
    await expect(service.save(form({ id, ...changes }))).rejects.toThrow(
      "Ngày",
    );
  }
  expect((await service.detail(id))?.person.birth_year).toBe(2000);
  await service.save(
    form({ id, death_year: "2000", death_month: "2", is_deceased: "true" }),
  );
  await service.save(form({ id, death_day: "29" }));
});

test("relative generation in a relationship leaves manually recorded Person generations unchanged", async () => {
  const owner = await account(),
    treeId = await tree(owner),
    service = familyPeople(owner, treeId, db);
  const parent = await service.save(
    form({ full_name: "Gốc", generation: "7", submissionId: randomUUID() }),
  );
  const child = await service.save(
    form({
      full_name: "Con",
      relatedTo: parent,
      relation: "child",
      submissionId: randomUUID(),
    }),
  );
  const [bulk] = await service.children({
    parentId: parent,
    submissionId: randomUUID(),
    children: [{ name: "Hai", gender: "other", birthYear: "", birthOrder: "" }],
  });
  await service.family(child);
  await service.family(parent);
  expect((await service.detail(child))?.person.generation).toBeNull();
  expect((await service.detail(bulk))?.person.generation).toBeNull();
  expect((await service.detail(parent))?.person.generation).toBe(7);
});
