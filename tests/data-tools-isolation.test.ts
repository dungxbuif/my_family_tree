import { beforeAll, afterAll, expect, test } from "bun:test";
import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import { familyPeople } from "@/utils/family/people";
import { createFamilyTree } from "@/utils/auth/tree-access";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FamilyStats from "@/components/FamilyStats";
import { computeKinship } from "@/utils/kinshipHelpers";

const connectionString = process.env.FAMILY_TREE_TEST_DATABASE_URL;
if (!connectionString)
  throw Error("A migrated PostgreSQL test database is required.");
const db = new Pool({ connectionString });
const owner = randomUUID(),
  peer = randomUUID(),
  token = randomUUID();
const roots = [randomUUID(), randomUUID()],
  children = [randomUUID(), randomUUID()];
const trees: string[] = [];
const tools = (index: number, actor = owner) =>
  familyPeople(actor, trees[index], db);
beforeAll(async () => {
  for (const id of [owner, peer]) {
    await db.query(
      "WITH u AS (INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test') RETURNING id) INSERT INTO profiles(id,is_active,is_super_admin) SELECT id,true,id=$3 FROM u",
      [id, id + "@example.test", peer],
    );
  }
  await db.query(
    "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')",
    [owner, createHash("sha256").update(token).digest("hex")],
  );
  for (const i of [0, 1]) {
    const tree = (
      await createFamilyTree(i ? peer : owner, "Data tools " + i, db)
    ).tree!.id;
    trees.push(tree);
    await db.query(
      "INSERT INTO tree_memberships(tree_id,user_id,role) VALUES($1,$2,$3)",
      [tree, i ? owner : peer, i ? "viewer" : "editor"],
    );
    await db.query(
      "INSERT INTO persons(tree_id,id,full_name,gender,generation,linked_user_id,email) VALUES($1,$2,'Same name','male',1,$4,$5),($1,$3,$6,'female',2,NULL,NULL)",
      [
        tree,
        roots[i],
        children[i],
        i ? peer : owner,
        "private" + i + "@example.test",
        "Child " + i,
      ],
    );
    await db.query(
      "INSERT INTO relationships(tree_id,type,person_a,person_b) VALUES($1,'biological_child',$2,$3)",
      [tree, roots[i], children[i]],
    );
    await db.query(
      "INSERT INTO person_details_private(tree_id,person_id,phone_number) VALUES($1,$2,$3)",
      [tree, roots[i], "phone-" + i],
    );
    await db.query(
      "INSERT INTO custom_events(tree_id,name,event_date) VALUES($1,$2,'2026-12-31')",
      [tree, "Event " + i],
    );
    await db.query(
      "INSERT INTO gallery_items(tree_id,title,image_url) VALUES($1,$2,$3)",
      [tree, "Gallery " + i, "/unverified/" + trees[0]],
    );
  }
});
afterAll(async () => {
  await db.query("DELETE FROM family_trees WHERE id=ANY($1::uuid[])", [trees]);
  await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [[owner, peer]]);
  await db.end();
});

test("Owner backup contains the selected genealogy, private facts and quarantined gallery metadata", async () => {
  expect(typeof tools(0).exportBackup).toBe("function");
  const data = await tools(0).exportBackup();
  expect(data.version).toBe(4);
  expect(data.persons.map((p) => p.id).sort()).toEqual(
    [roots[0], children[0]].sort(),
  );
  expect(data.person_details_private[0].phone_number).toBe("phone-0");
  expect(data.persons.find((p) => p.id === roots[0])?.email).toBe(
    "private0@example.test",
  );
  expect(data.custom_events.map((e) => e.name)).toEqual(["Event 0"]);
  expect(data.gallery_items[0]).toMatchObject({
    title: "Gallery 0",
    image_url: null,
  });
  for (const hidden of [
    roots[1],
    children[1],
    "phone-1",
    trees[1],
    "/unverified/",
    owner,
  ])
    expect(JSON.stringify(data)).not.toContain(hidden);
  const branch = await tools(0).exportBackup(children[0]);
  expect(branch.persons.map((p) => p.id)).toEqual([children[0]]);
  expect(branch.person_details_private).toEqual([]);
  expect(branch.relationships).toEqual([]);
  for (const id of [roots[1], randomUUID()])
    await expect(tools(0).exportBackup(id)).rejects.toThrow("Không tìm thấy");
});

test("current Tree Membership independently authorizes full backups and replacements", async () => {
  for (const service of [tools(0, peer), tools(1)]) {
    await expect(service.exportBackup()).rejects.toThrow("Từ chối");
    await expect(service.importBackup({})).rejects.toThrow("Từ chối");
  }
});

test("Viewer stats and kinship graphs contain only local people, and lineage writes are atomic", async () => {
  const viewer = tools(1),
    editor = tools(0, peer);
  await db.query(
    "UPDATE persons SET avatar_url=$1 WHERE tree_id=$2 AND id=$3",
    ["/legacy/" + trees[0], trees[1], roots[1]],
  );
  const graph = await viewer.graph();
  expect(JSON.stringify(graph)).not.toContain("/legacy/");
  expect(JSON.stringify(await viewer.selector())).not.toContain("/legacy/");
  expect(graph.persons).toHaveLength(2);
  expect((await viewer.selector()).map((p) => p.id).sort()).toEqual(
    [roots[1], children[1]].sort(),
  );
  const [root, child] = [roots[1], children[1]].map(
    (id) => graph.persons.find((p) => p.id === id)!,
  );
  expect(
    computeKinship(root, child, graph.persons, graph.relationships),
  ).toBeTruthy();
  const foreign = (await editor.graph()).persons[0];
  for (const person of [foreign, { ...foreign, id: randomUUID() }])
    expect(
      computeKinship(person, child, graph.persons, graph.relationships),
    ).toBeNull();
  const output = renderToStaticMarkup(createElement(FamilyStats, graph));
  const stats: string[] = [];
  new HTMLRewriter()
    .on("p", {
      text(part) {
        if (part.text) stats.push(part.text);
      },
    })
    .transform(output);
  expect(
    stats.slice(
      stats.indexOf("Tổng thành viên") - 1,
      stats.indexOf("Tổng thành viên") + 4,
    ),
  ).toEqual(["2", "Tổng thành viên", "1", "Nam", "1"]);
  expect(JSON.stringify(graph)).not.toContain(roots[0]);
  const update = {
    id: roots[0],
    generation: 7,
    birth_order: null,
    is_in_law: false,
  };
  await expect(viewer.lineage([{ ...update, id: roots[1] }])).rejects.toThrow(
    "Từ chối",
  );
  for (const id of [children[1], randomUUID()])
    await expect(editor.lineage([update, { ...update, id }])).rejects.toThrow(
      "Không tìm thấy",
    );
  expect((await editor.detail(roots[0]))?.person.generation).toBe(1);
  await editor.lineage([update]);
  expect((await editor.detail(roots[0]))?.person.generation).toBe(7);
});

test("restore remaps foreign IDs with internal references, preserves local links and quarantines foreign media", async () => {
  const target = tools(0),
    source = tools(1, peer);
  const original = await target.exportBackup(),
    other = await source.exportBackup();
  const foreignMedia = "/api/media/" + trees[1] + "/gallery/picture.png";
  const incoming = {
    ...other,
    persons: other.persons.map((p) => ({ ...p, avatar_url: foreignMedia })),
    gallery_items: other.gallery_items.map((g) => ({
      ...g,
      image_url: foreignMedia,
    })),
  };
  await expect(target.importBackup(incoming)).rejects.toThrow("liên kết");
  await db.query(
    "UPDATE persons SET linked_user_id=NULL WHERE tree_id=$1 AND id=$2",
    [trees[0], roots[0]],
  );
  const counts = await target.importBackup(incoming);
  expect(counts.persons).toBe(2);
  const restored = await target.exportBackup();
  const parent = restored.persons.find((p) => p.full_name === "Same name")!;
  expect(parent.id).not.toBe(roots[1]);
  expect(restored.relationships[0].person_a).toBe(parent.id);
  expect(restored.person_details_private[0].person_id).toBe(parent.id);
  expect(restored.gallery_items[0].image_url).toBeNull();
  expect(parent.avatar_url).toBeNull();
  expect(JSON.stringify(restored)).not.toContain(trees[1]);
  expect(restored.custom_events[0].id).not.toBe(other.custom_events[0].id);
  expect(restored.gallery_items[0].id).not.toBe(other.gallery_items[0].id);
  expect(restored.relationships[0].id).not.toBe(other.relationships[0].id);
  expect({ ...(await source.exportBackup()), timestamp: "" }).toEqual({
    ...other,
    timestamp: "",
  });
  await target.importBackup(original);
  const local = await target.exportBackup();
  await db.query(
    "UPDATE persons SET linked_user_id=$1 WHERE tree_id=$2 AND id=$3",
    [owner, trees[0], local.persons[0].id],
  );
  await target.importBackup(local);
  expect(
    (
      await db.query(
        "SELECT linked_user_id FROM persons WHERE tree_id=$1 AND id=$2",
        [trees[0], local.persons[0].id],
      )
    ).rows[0].linked_user_id,
  ).toBe(owner);
  expect({ ...(await target.exportBackup()), timestamp: "" }).toEqual({
    ...local,
    timestamp: "",
  });
});

test("a local backup restores detached, live image bytes and quarantines media owned by another tree", async () => {
  const service = tools(0),
    source = tools(1, peer);
  const bytes = Buffer.from("backup photo test");
  const issue = async (family: ReturnType<typeof tools>) => {
    const file = await family.issueUpload(
      "gallery",
      "backup.png",
      "image/png",
      bytes.length,
      {
        submissionId: randomUUID(),
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    );
    expect(
      (
        await fetch(file.uploadUrl, {
          method: "PUT",
          headers: { "content-type": "image/png" },
          body: bytes,
        })
      ).ok,
    ).toBe(true);
    return file.publicUrl;
  };
  const local = await issue(service),
    other = await issue(source);
  try {
    const galleryId = await service.saveGallery({
      title: "Restore photo",
      description: "",
      eventDate: "",
      imageUrl: local,
    });
    const before = await service.exportBackup();
    expect(
      before.gallery_items.find((g) => g.id === galleryId)?.image_url,
    ).toBe(local);
    await service.deleteGallery(galleryId);
    const incoming = {
      ...before,
      gallery_items: [
        ...before.gallery_items,
        {
          id: randomUUID(),
          title: "Foreign photo",
          description: null,
          event_date: null,
          image_url: other,
        },
      ],
    };
    await service.importBackup(incoming);
    const restored = await service.exportBackup();
    expect(
      restored.gallery_items.find((g) => g.title === "Restore photo")
        ?.image_url,
    ).toBe(local);
    expect(
      restored.gallery_items.find((g) => g.title === "Foreign photo")
        ?.image_url,
    ).toBeNull();
    expect(JSON.stringify(restored)).not.toContain(other);
  } finally {
    const { deleteObject } = await import("@/utils/storage/s3");
    for (const url of [local, other]) await deleteObject(url);
    await db.query("DELETE FROM tree_media WHERE object_url=ANY($1)", [
      [local, other],
    ]);
  }
});

test("invalid input and a database failure after replacement leave original rows intact", async () => {
  const service = tools(0),
    original = await service.exportBackup();
  for (const payload of [
    {
      ...original,
      persons: original.persons.map((p) => ({ ...p, linked_user_id: peer })),
    },
    {
      ...original,
      persons: original.persons.map((p) => ({ ...p, email: "invalid" })),
    },
    { ...original, version: 99 },
    { ...original, persons: [...original.persons, original.persons[0]] },
    {
      ...original,
      relationships: [{ ...original.relationships[0], person_b: children[1] }],
    },
    {
      ...original,
      custom_events: [
        { ...original.custom_events[0], event_date: "2026-02-30" },
      ],
    },
  ])
    await expect(service.importBackup(payload)).rejects.toThrow();
  // Exercise a transaction failure at commit, after every collection has been inserted.
  const name = "test_restore_" + randomUUID().replaceAll("-", "");
  await db.query(
    `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$`,
  );
  try {
    await db.query(
      `CREATE CONSTRAINT TRIGGER ${name} AFTER INSERT ON custom_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.tree_id='${trees[0]}') EXECUTE FUNCTION ${name}()`,
    );
    await expect(
      service.importBackup({ ...original, relationships: [] }),
    ).rejects.toThrow("Không thể phục hồi bản sao lưu.");
  } finally {
    await db.query(`DROP FUNCTION ${name}() CASCADE`);
  }
  expect({ ...(await service.exportBackup()), timestamp: "" }).toEqual({
    ...original,
    timestamp: "",
  });
});

test("selected production routes expose current role and scoped data", async () => {
  const base = process.env.FAMILY_TREE_TEST_APP_URL;
  if (!base) throw Error("The release suite requires a running application.");
  for (const [index, paths] of [
    [0, ["data", "stats", "lineage", "kinship"]],
    [1, ["data", "stats", "lineage", "kinship"]],
  ] as const) {
    for (const path of paths) {
      const res = await fetch(base + "/dashboard/" + path, {
        headers: {
          cookie: `family_tree_session=${token}; family_tree_selected=${trees[index]}`,
        },
        redirect: "manual",
      });
      const html = await res.text();
      if (index === 1 && ["data", "lineage"].includes(path)) {
        expect(html).not.toContain("Chọn file phục hồi");
        expect(html).toContain(
          path === "data"
            ? "Chỉ chủ sở hữu cây gia phả"
            : "Chỉ chủ sở hữu và người chỉnh sửa",
        );
      } else {
        expect(res.status).toBe(200);
        expect(html).toContain(
          path === "data"
            ? "Chọn file phục hồi"
            : path === "stats"
              ? "Thống kê gia phả"
              : path === "lineage"
                ? "Thứ tự gia phả"
                : "Tra cứu danh xưng",
        );
        expect(html).not.toContain("Child " + (1 - index));
      }
    }
  }
}, 30000);
