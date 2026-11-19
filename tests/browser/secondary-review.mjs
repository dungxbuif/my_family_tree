// The route holds an acknowledgement from the real Server Action while a
// second tab changes the selected tree through the application's selector.
export async function freezeAcknowledgement(page, app, section) {
  page.setDefaultTimeout(8000);
  // Start without a mounted tree listener while preparing the initial selection.
  await page.goto("about:blank");
  const peer = await page.context().newPage();
  const select = async (name) => {
    await peer.goto(app + "/dashboard/account/trees");
    const active = peer.getByRole("button", {
      name: new RegExp(name),
      pressed: true,
    });
    if (!(await active.count()))
      await peer.getByRole("button", { name: new RegExp(name) }).click();
    await active.waitFor();
  };
  let release, committed;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const saved = new Promise((resolve) => {
    committed = resolve;
  });
  const path = app + "/dashboard/" + section;
  try {
    await select("Album editor");
    await page.goto(path);
    const event = section === "events";
    await page
      .getByRole("button", { name: event ? "Thêm sự kiện" : "Thêm hình ảnh" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: event ? "Sự kiện" : "Hình ảnh",
    });
    const field = dialog.getByLabel(event ? "Tên sự kiện" : "Tiêu đề ảnh");
    const value = "Bản nháp đang lưu " + section;
    await field.fill(value);
    if (!event)
      await dialog
        .locator("input[type=file]")
        .setInputFiles({
          name: "a.png",
          mimeType: "image/png",
          buffer: Buffer.from("avatar"),
        });
    await page.route(path, async (route) => {
      if (!route.request().headers()["next-action"]) return route.continue();
      const response = await route.fetch();
      committed();
      await pending;
      await route.fulfill({ response });
    });
    await dialog.locator('button[type="submit"]').click();
    await Promise.race([
      saved,
      page.waitForTimeout(10000).then(() => {
        throw Error("The action never reached its acknowledgement");
      }),
    ]);
    await select("Album viewer");
    await dialog.getByRole("button", { name: "Ở lại với bản nháp" }).waitFor();
    const delivered = page.waitForResponse(
      (r) => r.request().headers()["next-action"] && r.url() === path,
    );
    release();
    await (await delivered).finished();
    await page.waitForFunction(
      () => !document.querySelector('[role="dialog"] .animate-spin'),
    );
    await dialog.getByRole("button", { name: "Ở lại với bản nháp" }).click();
    await dialog
      .getByRole("button", { name: "Chọn lại cây của bản nháp" })
      .click();
    await page.waitForFunction(
      () => !document.documentElement.dataset.staleTreeDraft,
    );
    if ((await field.inputValue()) !== value)
      throw Error("Lost draft after frozen acknowledgement");
    await dialog
      .getByRole("heading", {
        name: event ? "Sửa Sự Kiện" : "Chỉnh sửa hình ảnh",
      })
      .waitFor();
    await field.fill(value + " đã chỉnh sửa");
    await dialog.locator('button[type="submit"]').click();
    await dialog.waitFor({ state: "detached" });
    return true;
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
    await peer.close();
  }
}

export async function editQuarantinedPhoto(page, app) {
  await page.goto(app + "/dashboard/gallery");
  await page.getByRole("button", { name: /Ảnh cũ cần sửa/ }).click();
  let dialog = page.getByRole("dialog", { name: "Ảnh cũ cần sửa" });
  await dialog.getByText("Ảnh chưa khả dụng").waitFor();
  if (await dialog.locator("img").count())
    throw Error("Quarantined URL reached an image element");
  await dialog.getByRole("button", { name: "Sửa", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Hình ảnh" });
  await dialog
    .locator("input[type=file]")
    .setInputFiles({
      name: "a.png",
      mimeType: "image/png",
      buffer: Buffer.from("replacement"),
    });
  await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.getByRole("img", { name: "Ảnh cũ cần sửa" }).waitFor();
  return true;
}

export async function openEditor(page, app, section) {
  await page.goto(app + "/dashboard/" + section);
  await page
    .getByRole("button", {
      name: section === "events" ? "Thêm sự kiện" : "Thêm hình ảnh",
    })
    .click();
  await page.getByRole("dialog").waitFor();
  return true;
}

export async function refreshDemotedEditor(page, tree) {
  // Trigger the dashboard's normal same-document selection refresh. The server
  // rechecks membership while the same editor is still open.
  await page.evaluate((treeId) => {
    const revision =
      document.cookie
        .split("; ")
        .find((c) => c.startsWith("family_tree_revision="))
        ?.split("=")[1] ?? "";
    window.dispatchEvent(
      new CustomEvent("familytreeselected", {
        detail: { currentId: treeId, revision },
      }),
    );
  }, tree);
  await page.getByText("Chỉ xem", { exact: true }).waitFor();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  return true;
}

export async function interruptAvatarSave(page, app) {
  await page.goto(app + "/dashboard/members/new");
  await page.waitForLoadState("networkidle");
  const state = { uploads: [], puts: 0, actions: 0 };
  await page.route("**/api/uploads/presign", async (route) => {
    const response = await route.fetch();
    state.uploads.push((await response.json()).publicUrl);
    await route.fulfill({ response });
  });
  await page.route(/X-Amz-Signature=/i, async (route) => {
    if (route.request().method() === "PUT") state.puts++;
    await route.continue();
  });
  await page.route("**/dashboard/members/new", async (route) => {
    if (route.request().method() === "POST" && ++state.actions === 1)
      return route.abort("failed");
    await route.continue();
  });
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: Buffer.from("old portrait"),
    });
  await page.locator("input[required]").first().fill("Ảnh sau khi dọn tệp");
  await page.locator("button[type=submit]").click();
  await page
    .locator("form")
    .getByText(/fetch|network/i)
    .waitFor();
  if (state.uploads.length !== 1 || state.puts !== 1 || state.actions !== 1)
    throw Error("Initial upload did not reach the failed Person save");
  return state.uploads[0];
}

export async function retryPrunedAvatar(page) {
  // Neither reselect the file nor reload the form.
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/\/members\/[0-9a-f-]{36}/, { timeout: 8000 });
  return true;
}
