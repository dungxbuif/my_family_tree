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

test("legacy PostgreSQL event exports survive JSON and CSV ZIP restore with their calendar date", async () => {
  const current = tools(0),
    data = await current.exportBackup();
  const { createServerDataClient } = await import("@/utils/db/table-client");
  const prior = await createServerDataClient()
    .from("custom_events")
    .select("*")
    .eq("id", data.custom_events[0].id);
  const legacy = JSON.parse(
    JSON.stringify({ ...data, version: 3, custom_events: prior.data }),
  );
  expect(legacy.custom_events[0].event_date).toMatch(/T.*Z$/);
  await current.importBackup(legacy);
  expect((await current.calendar())[0].event_date).toBe("2026-12-31");
  const { default: JSZip } = await import("jszip");
  const { default: Papa } = await import("papaparse");
  const { parseCsvZip } = await import("@/utils/csv");
  const zip = new JSZip();
  for (const key of [
    "persons",
    "relationships",
    "custom_events",
    "person_details_private",
  ])
    zip.file(
      key + ".csv",
      "\uFEFF" +
        Papa.unparse(key === "custom_events" ? prior.data : legacy[key]),
    );
  await current.importBackup(
    await parseCsvZip(await zip.generateAsync({ type: "blob" })),
  );
  expect((await current.calendar())[0].event_date).toBe("2026-12-31");
  await expect(
    current.importBackup({
      ...data,
      custom_events: [
        {
          ...data.custom_events[0],
          event_date: legacy.custom_events[0].event_date,
        },
      ],
    }),
  ).rejects.toThrow();
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
  await db.query(
    "UPDATE persons SET linked_user_id=$1 WHERE tree_id=$2 AND id=$3",
    [owner, trees[0], parent.id],
  );
  await target.importBackup(incoming);
  expect(
    (
      await db.query(
        "SELECT linked_user_id FROM persons WHERE tree_id=$1 AND id=$2",
        [trees[0], parent.id],
      )
    ).rows[0].linked_user_id,
  ).toBe(owner);
  await db.query(
    "UPDATE persons SET linked_user_id=NULL WHERE tree_id=$1 AND id=$2",
    [trees[0], parent.id],
  );
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
    await (await import("@/utils/storage/s3")).deleteObject(local);
    await service.importBackup(restored);
    const missing = (await service.exportBackup()).gallery_items.find(
      (g) => g.title === "Restore photo",
    );
    expect(missing?.image_url).toBeNull();
    expect(JSON.stringify(restored)).not.toContain(other);
  } finally {
    const { deleteObject } = await import("@/utils/storage/s3");
    for (const url of [local, other]) await deleteObject(url);
    await db.query("DELETE FROM tree_media WHERE object_url=ANY($1)", [
      [local, other],
    ]);
  }
});

test("slow storage verification is bounded and releases account and tree locks before rechecking Owner access", async () => {
  const tree = (await createFamilyTree(owner, "Restore race", db)).tree!.id;
  const family = familyPeople(owner, tree, db);
  const original = await family.exportBackup();
  const unlock = Promise.withResolvers<void>(),
    fourRequests = Promise.withResolvers<void>();
  let started = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch() {
      if (++started === 4) fourRequests.resolve();
      await unlock.promise;
      return new Response(null, { status: 404 });
    },
  });
  const endpoint = process.env.S3_ENDPOINT;
  let pending: Promise<unknown> | undefined;
  try {
    process.env.S3_ENDPOINT = server.url.origin;
    const gallery_items = Array.from({ length: 7 }, (_, i) => ({
      id: randomUUID(),
      title: "Test " + i,
      image_url:
        "/api/storage/family-tree/trees/" +
        tree +
        "/gallery/" +
        randomUUID() +
        ".png",
      event_date: null,
      description: null,
    }));
    await db.query(
      "INSERT INTO tree_media(tree_id,folder,object_url,cleanup_after) SELECT $1,'gallery',url,now() FROM unnest($2::text[]) AS url",
      [tree, gallery_items.map((g) => g.image_url)],
    );
    pending = family.importBackup({ ...original, gallery_items });
    await Promise.race([
      fourRequests.promise,
      Bun.sleep(3500).then(() => {
        throw Error("Four probes did not start");
      }),
    ]);
    const lock = await db.connect();
    try {
      await lock.query("BEGIN");
      await lock.query("SET LOCAL lock_timeout='500ms'");
      const { accountAccessLock } = await import(
        "@/utils/auth/account-access-lock"
      );
      await lock.query(accountAccessLock.exclusive);
      await lock.query(
        "SELECT id FROM family_trees WHERE id=$1 FOR UPDATE NOWAIT",
        [tree],
      );
      await lock.query(
        "INSERT INTO tree_memberships(tree_id,user_id,role) VALUES($1,$2,'owner')",
        [tree, peer],
      );
      await lock.query(
        "UPDATE tree_memberships SET role='viewer' WHERE tree_id=$1 AND user_id=$2",
        [tree, owner],
      );
      await lock.query("COMMIT");
    } finally {
      await lock.query("ROLLBACK");
      lock.release();
    }
    expect(started).toBe(4);
    // Leave the HTTP server stalled. The shared five-second deadline ends the group.
    await expect(pending).rejects.toThrow("Từ chối");
    expect(started).toBe(4);
    expect(
      (await familyPeople(peer, tree, db).exportBackup()).gallery_items,
    ).toEqual([]);
  } finally {
    unlock.resolve();
    await pending?.catch(() => {});
    if (endpoint === undefined) delete process.env.S3_ENDPOINT;
    else process.env.S3_ENDPOINT = endpoint;
    await server.stop(true);
    await db.query("DELETE FROM tree_media WHERE tree_id=$1", [tree]);
    await db.query("DELETE FROM family_trees WHERE id=$1", [tree]);
  }
}, 12000);

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

test("GEDCOM replacement preserves recorded parentage and rejects ambiguous legacy exports before writing", async () => {
  const tree = (await createFamilyTree(owner, "GEDCOM restore", db)).tree!.id;
  trees.push(tree);
  const service = familyPeople(owner, tree, db);
  const ids = Array.from({length: 4}, () => randomUUID());
  const [a, b, c, d] = ids;
  await db.query("INSERT INTO persons(id,tree_id,full_name,gender) SELECT id,$1,id::text,'other' FROM unnest($2::uuid[]) id", [tree, ids]);
  const edges = [
    ["marriage", a, b], ["marriage", a, c], ["adopted_child", a, d], ["biological_child", c, d],
  ];
  for (const edge of edges)
    await db.query("INSERT INTO relationships(tree_id,type,person_a,person_b) VALUES($1,$2,$3,$4)", [tree, ...edge]);
  const base = process.env.FAMILY_TREE_TEST_APP_URL!;
  async function replace(file: Blob) {
    const form = new FormData();
    form.set("backup", file, "family.ged");
    form.set("confirmed", "replace");
    return fetch(base + "/dashboard/data/restore?tree=" + tree, {
      method: "POST", headers: { origin: base, accept: "application/json",
        cookie: `family_tree_session=${token}; family_tree_selected=${tree}` }, body: form,
    });
  }
  const { createBackupFile } = await import("@/utils/family/backup-file");
  expect((await replace(await createBackupFile(await service.exportBackup(), "ged"))).status).toBe(200);
  const after = await service.exportBackup();
  expect(after.relationships.map(r => [r.type, r.person_a, r.person_b]).sort()).toEqual(edges.sort());
  const old = "0 HEAD\n1 SOUR Giapha_OS\n2 VERS 0.1.0\n0 @P@ INDI\n1 NAME Parent\n0 @C@ INDI\n1 NAME Child\n0 @F@ FAM\n1 HUSB @P@\n1 CHIL @C@\n0 TRLR";
  const response = await replace(new Blob([old]));
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain("GEDCOM");
  expect((await service.exportBackup()).relationships).toEqual(after.relationships);
});

test("the bounded restore route accepts a large file and rejects oversize input before replacement", async () => {
  const base = process.env.FAMILY_TREE_TEST_APP_URL!;
  const original = await tools(0).exportBackup();
  const post = (file: Blob, name: string, tree = trees[0]) => {
    const form = new FormData();
    form.set("backup", file, name);
    form.set("confirmed", "replace");
    return fetch(base + "/dashboard/data/restore?tree=" + tree, {
      method: "POST",
      headers: {
        origin: base,
        accept: "application/json",
        cookie: `family_tree_session=${token}; family_tree_selected=${tree}`,
      },
      body: form,
    });
  };
  await db.query(
    "INSERT INTO persons(tree_id,full_name,gender,note) SELECT $1,'Large '||i,'other',repeat('x',320) FROM generate_series(1,15000) AS i",
    [trees[0]],
  );
  const source = await tools(0).exportBackup();
  const { createBackupFile } = await import("@/utils/family/backup-file");
  const blob = await createBackupFile(source, "json");
  expect(blob.size).toBeGreaterThan(10 * 1024 * 1024);
  await tools(0).importBackup(original);
  expect((await post(blob, "generated.json")).status).toBe(200);
  const restored = await tools(0).exportBackup();
  expect(restored.persons).toHaveLength(source.persons.length);
  expect(
    restored.persons.filter((row) => row.note === "x".repeat(320)),
  ).toHaveLength(15000);
  const { backupFileLimit } = await import("@/utils/family/backup-limit");
  const tooLarge = await post(
    new Blob([new Uint8Array(backupFileLimit + 1)]),
    "oversize.json",
  );
  expect(tooLarge.status).toBe(413);
  expect(await tooLarge.json()).toMatchObject({ code: "BACKUP_TOO_LARGE" });

  // Exercise both HTTP/1 framing modes on the wire. No Content-Length means
  // the server must count actual body chunks rather than trust a header.
  const { request } = await import("node:http");
  const restoreUrl = base + "/dashboard/data/restore?tree=" + trees[0];
  async function oversizedRequest(declaredLength: boolean) {
    return new Promise<{ status?: number; body: string }>((resolve, reject) => {
      const req = request(
        restoreUrl,
        {
          method: "POST",
          agent: false,
          headers: {
            origin: base,
            accept: "application/json",
            "content-type": "multipart/form-data; boundary=size",
            ...(declaredLength
              ? { "content-length": backupFileLimit + 65537 }
              : { "transfer-encoding": "chunked" }),
            cookie: `family_tree_session=${token}; family_tree_selected=${trees[0]}`,
          },
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8").on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            resolve({ status: res.statusCode, body });
            req.destroy();
          });
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.setTimeout(6000, () =>
        req.destroy(Error("Oversized upload was not rejected")),
      );
      if (declaredLength) {
        req.flushHeaders(); // Expect rejection before sending any bytes.
      } else {
        const chunk = Buffer.alloc(1024 * 1024);
        for (
          let bytes = 0;
          bytes <= backupFileLimit + 65536;
          bytes += chunk.length
        )
          req.write(chunk);
        req.end();
      }
    });
  }
  for (const declared of [true, false]) {
    const rejection = await oversizedRequest(declared);
    expect(rejection.status).toBe(413);
    expect(JSON.parse(rejection.body)).toMatchObject({
      code: "BACKUP_TOO_LARGE",
    });
  }
  expect(
    (
      await post(
        new Blob(["0 @I1@ INDI\n1 FAMS @F1@\n0 @F1@ FAM"]),
        "truncated.ged",
      )
    ).status,
  ).toBe(400);
  expect((await tools(0).exportBackup()).relationships).toEqual(
    original.relationships,
  );
  expect(
    (await post(new Blob([JSON.stringify(source)]), "large.json", trees[1]))
      .status,
  ).toBe(403);
  await tools(0).importBackup(original);
}, 60_000);

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
