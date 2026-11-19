import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { pruneTreeMedia } from "@/utils/storage/prune";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createFamilyTree } from "@/utils/auth/tree-access";

const connectionString = process.env.FAMILY_TREE_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("A migrated PostgreSQL test database is required.");
const db = new Pool({ connectionString });
const url = process.env.FAMILY_TREE_TEST_APP_URL;
const webTest = test.skipIf(!url);
const owner = randomUUID(),
  editor = randomUUID(),
  token = randomUUID();
let a: string, b: string;
const cookie = (tree: string) =>
  `family_tree_session=${token}; family_tree_selected=${tree}`;
beforeAll(async () => {
  for (const id of [owner, editor]) {
    await db.query(
      `WITH u AS (INSERT INTO users(id,email,password_hash) VALUES ($1,$2,'test') RETURNING id)
      INSERT INTO profiles(id,is_active) SELECT id,true FROM u`,
      [id, id + "@example.test"],
    );
  }
  a = (await createFamilyTree(owner, "Album A", db)).tree!.id;
  b = (await createFamilyTree(owner, "Album B", db)).tree!.id;
  await db.query(
    "INSERT INTO tree_memberships(tree_id,user_id,role) VALUES ($1,$2,'editor'),($3,$2,'viewer')",
    [a, editor, b],
  );
  await db.query(
    "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '15 minutes')",
    [editor, createHash("sha256").update(token).digest("hex")],
  );
});
afterAll(async () => {
  await db.query("DELETE FROM family_trees WHERE id=ANY($1::uuid[])", [[a, b]]);
  await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [owner, editor],
  ]);
  await db.end();
});

webTest(
  "Gallery and Event pages show read-only controls to a Viewer",
  async () => {
    for (const [page, button] of [
      ["gallery", "Thêm hình ảnh"],
      ["events", "Thêm sự kiện"],
    ]) {
      const html = await (
        await fetch(url + "/dashboard/" + page, {
          headers: { cookie: cookie(b) },
        })
      ).text();
      const buttons: string[] = [];
      new HTMLRewriter()
        .on("button", {
          text(t) {
            buttons.push(t.text);
          },
        })
        .transform(html);
      expect(buttons).not.toContain(button);
      expect(html).toContain("Chỉ xem");
    }
  },
  30000,
);

import { familyPeople } from "@/utils/family/people";
const event = {
  name: "Họp mặt",
  event_date: "2026-12-01",
  location: null,
  content: null,
};

test("event creation, calendar, updates and deletion follow the active membership", async () => {
  const edit = familyPeople(editor, a, db),
    view = familyPeople(editor, b, db),
    own = familyPeople(owner, b, db);
  const id = await edit.saveEvent(event);
  const other = await own.saveEvent({ ...event, name: "Cây thứ hai" });
  expect((await edit.calendar()).map((x) => x.id)).toEqual([id]);
  expect((await view.calendar()).map((x) => x.id)).toEqual([other]);
  await edit.saveEvent({ ...event, id, name: "Gặp gia đình" });
  expect((await edit.calendar())[0].name).toBe("Gặp gia đình");
  for (const missing of [other, randomUUID()]) {
    await expect(edit.saveEvent({ ...event, id: missing })).rejects.toThrow(
      "Không tìm thấy",
    );
    await expect(edit.deleteEvent(missing)).rejects.toThrow("Không tìm thấy");
  }
  await expect(view.saveEvent(event)).rejects.toThrow("Từ chối");
  await expect(view.deleteEvent(other)).rejects.toThrow("Từ chối");
  await edit.deleteEvent(id);
  expect(await edit.calendar()).toEqual([]);
});

const mediaTest = test.skipIf(!url || !process.env.FAMILY_TREE_TEST_LIVE_S3);
mediaTest(
  "issued Gallery objects, Gallery changes and private reads stay in the issuing tree",
  async () => {
    const edit = familyPeople(editor, a, db),
      own = familyPeople(owner, b, db),
      viewer = familyPeople(editor, b, db);
    const bytes = Buffer.from("private image fixture");
    const payload = {
      treeId: a,
      folder: "gallery",
      fileName: "Kỷ niệm.png",
      contentType: "image/png",
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      submissionId: randomUUID(),
    };
    const sign = (tree: string, changes = {}) =>
      fetch(url + "/api/uploads/presign", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookie(tree) },
        body: JSON.stringify({ ...payload, ...changes }),
      });
    const read = (path: string, tree?: string, range?: string) =>
      fetch(url + path, {
        headers: {
          ...(tree ? { cookie: cookie(tree) } : {}),
          ...(range ? { range } : {}),
        },
      });
    expect((await sign(b, { treeId: b })).status).toBe(403);
    expect((await sign(a, { treeId: b })).status).toBe(403);
    for (const bad of [
      { size: 0 },
      { size: 10485761 },
      { contentType: "text/html" },
      { folder: "other" },
      { key: "chosen" },
    ])
      expect((await sign(a, bad)).status).toBe(400);
    const signed = await sign(a);
    expect(signed.status).toBe(200);
    const { publicUrl, uploadUrl } = await signed.json();
    expect(publicUrl).toContain("/" + a + "/gallery/");
    expect((await (await sign(a)).json()).publicUrl).toBe(publicUrl);
    expect(
      (
        await fetch(uploadUrl, {
          method: "PUT",
          headers: { "content-type": "image/png" },
          body: bytes,
        })
      ).ok,
    ).toBe(true);
    const draft = {
      title: "Kỷ niệm",
      imageUrl: publicUrl,
      description: "",
      eventDate: "",
    };
    const id = await edit.saveGallery(draft);
    expect(await edit.saveGallery(draft)).toBe(id);
    expect((await edit.gallery()).map((x) => x.id)).toEqual([id]);
    expect(await own.gallery()).toEqual([]);
    for (const bad of [publicUrl, "https://example.test/photo.png"]) {
      await expect(
        own.saveGallery({ ...draft, imageUrl: bad }),
      ).rejects.toThrow("Ảnh");
    }
    for (const missing of [id, randomUUID()]) {
      await expect(own.saveGallery({ ...draft, id: missing })).rejects.toThrow(
        "Không tìm thấy",
      );
      await expect(own.deleteGallery(missing)).rejects.toThrow(
        "Không tìm thấy",
      );
    }
    await expect(viewer.saveGallery(draft)).rejects.toThrow("Từ chối");
    await expect(viewer.deleteGallery(id)).rejects.toThrow("Từ chối");
    await edit.saveGallery({ ...draft, id, title: "Kỷ niệm mới" });
    expect((await edit.gallery())[0].title).toBe("Kỷ niệm mới");
    const object = await read(publicUrl, a);
    expect(object.status).toBe(200);
    expect(object.headers.get("cache-control")).toContain("private");
    expect(object.headers.get("cache-control")).toContain("no-store");
    expect(object.headers.get("content-type")).toBe("image/png");
    expect(await object.text()).toBe(bytes.toString());
    const pastEnd = await read(publicUrl, a, "bytes=999-");
    expect(pastEnd.status).toBe(416);
    expect(pastEnd.headers.get("content-range")).toBe(
      "bytes */" + bytes.length,
    );
    expect(pastEnd.headers.get("cache-control")).toContain("no-store");
    expect((await read(publicUrl, b, "bytes=999-")).status).toBe(404);
    const partial = await read(publicUrl, a, "bytes=0-2");
    expect(partial.status).toBe(206);
    expect(await partial.text()).toBe("pri");
    for (const response of [
      await read(publicUrl),
      await read(publicUrl, b),
      await read(publicUrl.replace(/[0-9a-f]+\.png$/, "unknown.png"), a),
    ]) {
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    await db.query(
      "UPDATE tree_memberships SET role='viewer' WHERE tree_id=$1 AND user_id=$2",
      [a, editor],
    );
    expect((await read(publicUrl, a)).status).toBe(200);
    expect((await sign(a)).status).toBe(403);
    await db.query(
      "DELETE FROM tree_memberships WHERE tree_id=$1 AND user_id=$2",
      [a, editor],
    );
    try {
      expect((await read(publicUrl, a)).status).toBe(404);
      expect((await sign(a)).status).toBe(403);
      await expect(edit.gallery()).rejects.toThrow("Từ chối");
      await expect(edit.saveEvent(event)).rejects.toThrow("Từ chối");
      await familyPeople(owner, a, db).deleteGallery(id);
    } finally {
      await db.query(
        "INSERT INTO tree_memberships(tree_id,user_id,role) VALUES($1,$2,'editor')",
        [a, editor],
      );
    }
    expect((await read(publicUrl, a)).status).toBe(404);
    const s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      region: "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
    const head = () =>
      s3.send(
        new HeadObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: publicUrl.slice("/api/storage/".length),
        }),
      );
    expect((await pruneTreeMedia(a)).removed).toBe(0);
    expect((await head()).ContentLength).toBe(bytes.length);
    await db.query(
      "UPDATE tree_media SET cleanup_after=now() WHERE object_url=$1",
      [publicUrl],
    );
    expect((await pruneTreeMedia(b)).removed).toBe(0);
    expect((await pruneTreeMedia(a)).removed).toBe(1);
    await expect(head()).rejects.toMatchObject({
      $metadata: { httpStatusCode: 404 },
    });
    expect((await pruneTreeMedia(a)).removed).toBe(0);
  },
  30000,
);

test("metadata edits keep legacy Gallery ownership and reject unavailable items", async () => {
  const legacyUrl = "/api/storage/family-tree/gallery/" + randomUUID() + ".png";
  await db.query(
    "INSERT INTO tree_media(object_url,tree_id,folder,cleanup_after) VALUES($1,$2,'gallery',now())",
    [legacyUrl, a],
  );
  const {
    rows: [{ id }],
  } = await db.query(
    "INSERT INTO gallery_items(tree_id,title,image_url) VALUES($1,'Ảnh cũ',$2) RETURNING id",
    [a, legacyUrl],
  );
  const edit = familyPeople(editor, a, db),
    own = familyPeople(owner, b, db);
  const draft = {
    id,
    title: "Ảnh kỷ niệm",
    imageUrl: legacyUrl,
    eventDate: "",
    description: "",
  };
  await edit.saveGallery(draft);
  expect((await edit.gallery()).map((x) => x.title)).toEqual(["Ảnh kỷ niệm"]);
  expect(await own.gallery()).toEqual([]);
  for (const missing of [id, randomUUID()]) {
    await expect(own.saveGallery({ ...draft, id: missing })).rejects.toThrow(
      "Không tìm thấy",
    );
    await expect(own.deleteGallery(missing)).rejects.toThrow("Không tìm thấy");
  }
  await expect(own.saveGallery({ ...draft, id: undefined })).rejects.toThrow(
    "Ảnh",
  );
  await edit.deleteGallery(id);
  expect(await edit.gallery()).toEqual([]);
  await db.query("DELETE FROM tree_media WHERE object_url=$1", [legacyUrl]);
});

// Submit the same payloads as a hydrated form after the user has switched trees.
webTest(
  "stale Gallery and Event Server Actions cannot save a draft in another selected tree",
  async () => {
    const { encodeReply } = await import(
      "next/dist/compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-client.node.production"
    );
    const fields = new FormData();
    // Bun serializes FormData as JSON before React can encode its multipart reference.
    Object.defineProperty(fields, "toJSON", { value: undefined });
    fields.set("treeId", a);
    fields.set("title", "Ảnh cũ");
    const edit = familyPeople(editor, a, db),
      id = await edit.saveEvent(event);
    try {
      for (const [page, actions] of [
        [
          "events",
          [
            ["saveCustomEvent", [{ ...event, id, name: "Sai cây" }, a]],
            ["deleteCustomEvent", [id, a]],
          ],
        ],
        [
          "gallery",
          [
            ["uploadGalleryItem", [fields]],
            ["deleteGalleryItem", [randomUUID(), a]],
          ],
        ],
      ] as [string, [string, unknown[]][]][]) {
        const path = new URL("/dashboard/" + page, url);
        await (await fetch(path, { headers: { cookie: cookie(a) } })).text();
        const manifest = await Bun.file(
          process.env.FAMILY_TREE_TEST_ACTION_MANIFEST ??
            ".next/dev/server/server-reference-manifest.json",
        ).json();
        for (const [name, args] of actions) {
          const ref = Object.entries<{ exportedName: string }>(
            manifest.node,
          ).find(([, entry]) => entry.exportedName === name)?.[0];
          expect(ref).toBeTruthy();
          const reply = await fetch(path, {
            method: "POST",
            headers: {
              cookie: cookie(b),
              origin: path.origin,
              "Next-Action": ref!,
            },
            body: await encodeReply(args),
          });
          expect(reply.status).toBe(200);
          expect(await reply.text()).toContain('"error":"Từ chối truy cập."');
        }
      }
      expect((await edit.calendar())[0].name).toBe(event.name);
    } finally {
      await edit.deleteEvent(id);
    }
  },
  30000,
);

mediaTest(
  "an attached avatar survives a deterministic retry and its tree owns the private proxy URL",
  async () => {
    const family = familyPeople(editor, a, db),
      foreign = familyPeople(owner, b, db);
    const bytes = Buffer.from("avatar"),
      submissionId = randomUUID();
    const identity = {
      submissionId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const issue = () =>
      family.issueUpload(
        "avatars",
        "portrait.png",
        "image/png",
        bytes.length,
        identity,
      );
    const upload = await issue();
    expect((await issue()).publicUrl).toBe(upload.publicUrl);
    expect(
      (
        await fetch(upload.uploadUrl, {
          method: "PUT",
          body: bytes,
          headers: { "content-type": "image/png" },
        })
      ).ok,
    ).toBe(true);
    const fields = new FormData();
    fields.set("submissionId", submissionId);
    fields.set("full_name", "Ảnh chân dung");
    fields.set("avatar_url", upload.publicUrl);
    const id = await family.save(fields);
    expect(await family.save(fields)).toBe(id);
    await expect(foreign.save(fields)).rejects.toThrow("Ảnh");
    const read = (tree: string) =>
      fetch(url + upload.publicUrl, { headers: { cookie: cookie(tree) } });
    expect(await (await read(a)).text()).toBe("avatar");
    expect((await read(b)).status).toBe(404);
    await db.query(
      "UPDATE tree_media SET cleanup_after=now() WHERE object_url=$1",
      [upload.publicUrl],
    );
    expect((await pruneTreeMedia(a)).removed).toBe(0);
    await family.remove(id);
    expect((await read(a)).status).toBe(404);
    expect((await pruneTreeMedia(a)).removed).toBe(1);
  },
);

test("the public image optimizer accepts static artwork and excludes private media", async () => {
  const { hasLocalMatch } = await import(
    "next/dist/shared/lib/match-local-pattern"
  );
  const { default: config } = await import("../next.config");
  expect(hasLocalMatch(config.images?.localPatterns, "/icon.png")).toBe(true);
  expect(
    hasLocalMatch(
      config.images?.localPatterns,
      "/api/storage/family-tree/gallery/abc.png",
    ),
  ).toBe(false);
});

test("an unverified Gallery record exposes its metadata and withholds its image URL", async () => {
  const {
    rows: [{ id }],
  } = await db.query(
    "INSERT INTO gallery_items(tree_id,title,image_url) VALUES($1,'Ảnh cần cập nhật',$2) RETURNING id",
    [a, "https://example.test/a.jpg"],
  );
  const family = familyPeople(editor, a, db);
  expect((await family.gallery()).find((x) => x.id === id)).toMatchObject({
    title: "Ảnh cần cập nhật",
    image_url: null,
  });
  await family.deleteGallery(id);
  expect((await family.gallery()).some((x) => x.id === id)).toBe(false);
});

mediaTest(
  "a Person can attach its issued avatar only after a successful PUT",
  async () => {
    const service = familyPeople(editor, a, db),
      submissionId = randomUUID(),
      bytes = Buffer.from("existing portrait");
    const identity = {
      submissionId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const sign = () =>
      service.issueUpload(
        "avatars",
        "a.png",
        "image/png",
        bytes.length,
        identity,
      );
    const first = await sign();
    const fields = new FormData();
    fields.set("full_name", "Ảnh");
    fields.set("submissionId", submissionId);
    fields.set("avatar_url", first.publicUrl);
    await expect(service.save(fields)).rejects.toThrow("Ảnh");
    await db.query(
      "UPDATE tree_media SET cleanup_after=now() WHERE object_url=$1",
      [first.publicUrl],
    );
    expect((await pruneTreeMedia(a)).removed).toBe(1);
    await expect(service.save(fields)).rejects.toThrow("Ảnh");
    const retry = await sign();
    expect(retry.key).toBe(first.key);
    expect(
      (
        await fetch(retry.uploadUrl, {
          method: "PUT",
          body: bytes,
          headers: { "content-type": "image/png" },
        })
      ).ok,
    ).toBe(true);
    const id = await service.save(fields);
    expect(await service.save(fields)).toBe(id);
  },
);

mediaTest(
  "an individual failed object deletion yields to later eligible objects",
  async () => {
    const nextUrl = () =>
      "/api/storage/family-tree/trees/" +
      a +
      "/gallery/" +
      randomUUID() +
      ".png";
    const failed = nextUrl(),
      clean = nextUrl();
    await db.query(
      "INSERT INTO tree_media(tree_id,folder,object_url,cleanup_after) VALUES($1,'gallery',$2,now()-interval '2 days'),($1,'gallery',$3,now()-interval '1 day')",
      [a, failed, clean],
    );
    // A local storage adapter models one key-specific backend failure.
    expect(
      await pruneTreeMedia(a, 10, async (url) => {
        // A different pool connection can acquire the row during S3 I/O.
        expect((await db.query("SELECT FROM tree_media WHERE object_url=$1 AND cleanup_claim IS NOT NULL FOR UPDATE NOWAIT",[url])).rowCount).toBe(1);
        if (url === failed) throw Error("storage busy");
      }),
    ).toEqual({ considered: 2, removed: 1, failed: 1 });
    expect(
      (
        await db.query(
          "SELECT object_url FROM tree_media WHERE object_url=ANY($1) AND cleanup_after>now() AND cleanup_attempts=1 AND cleanup_claim IS NOT NULL",
          [[failed, clean]],
        )
      ).rows,
    ).toEqual([{ object_url: failed }]);
    await db.query(
      "UPDATE tree_media SET cleanup_after=now() WHERE object_url=$1",
      [failed],
    );
    expect((await pruneTreeMedia(a)).removed).toBe(1);
  },
);
