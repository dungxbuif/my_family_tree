// Each function is passed to playwright-cli run-code and runs in its own page context.
export async function recoverSelectionBody(page) {
  const graph = new URL("/dashboard/members?view=tree", page.url()).href;
  const trees = new URL("/dashboard/account/trees", graph).href;
  const peer = await page.context().newPage();
  try {
    await page.goto(trees);
    await peer.goto(graph);
    await peer
      .getByRole("button", { name: "Thêm thành viên", exact: true })
      .waitFor();
    await page.evaluate(() => {
      const original = window.fetch;
      window.fetch = async (...args) => {
        const response = await original(...args);
        if (
          String(args[0]).endsWith("/trees/selection") &&
          args[1]?.method === "POST"
        ) {
          window.fetch = original;
          return new Response("{", { status: response.status });
        }
        return response;
      };
    });
    await page.getByRole("button", { name: /Cây thứ hai/ }).click();
    await page.getByRole("button", { name: "Tải lại danh sách" }).click();
    await page
      .getByRole("button", { name: /Cây thứ hai/, pressed: true })
      .waitFor();
    // No focus, visibility or history event on the already-visible peer.
    await peer
      .getByRole("button", { name: "Xem thông tin Nhà khác" })
      .waitFor({ timeout: 2500 });
    return (
      (await peer
        .getByRole("button", { name: "Thêm thành viên", exact: true })
        .count()) === 0
    );
  } finally {
    await peer.close();
    await page.goto(trees);
    await page.getByRole("button", { name: /Gia phả kiểm thử/ }).click();
    await page
      .getByRole("button", { name: /Gia phả kiểm thử/, pressed: true })
      .waitFor();
  }
}

export async function restoreDirtyTree(page) {
  await page.goto(new URL("/dashboard/members?view=tree", page.url()).href);
  await page
    .getByRole("button", { name: "Thêm thành viên", exact: true })
    .click();
  const draft = page.getByRole("dialog", {
    name: "Thêm thành viên",
    exact: true,
  });
  await draft.getByLabel("Họ và tên").fill("Bản nháp đã khôi phục");
  const selector = await page.context().newPage();
  try {
    await selector.goto(new URL("/dashboard/account/trees", page.url()).href);
    await selector.getByRole("button", { name: /Cây thứ hai/ }).click();
    await selector
      .getByRole("button", { name: /Cây thứ hai/, pressed: true })
      .waitFor();
    await draft
      .getByRole("button", { name: "Ở lại với bản nháp" })
      .click({ timeout: 2500 });
    const name = draft.getByLabel("Họ và tên");
    if (
      !(await name.isVisible()) ||
      (await name.inputValue()) !== "Bản nháp đã khôi phục" ||
      !(await draft
        .getByRole("button", { name: "Lưu", exact: true })
        .isDisabled())
    )
      return false;
    await draft
      .getByRole("button", { name: "Chọn lại cây của bản nháp" })
      .click();
    await name.fill("Đã tiếp tục trong cây gốc");
    await draft.getByRole("button", { name: "Lưu", exact: true }).click();
    await page
      .getByRole("button", { name: "Xem thông tin Đã tiếp tục trong cây gốc" })
      .waitFor({ timeout: 5000 });
    await page
      .getByRole("button", { name: "Thêm thành viên", exact: true })
      .click();
    await name.fill("Bản nháp sẽ bỏ");
    await selector.getByRole("button", { name: /Cây thứ hai/ }).click();
    await selector
      .getByRole("button", { name: /Cây thứ hai/, pressed: true })
      .waitFor();
    await draft.getByRole("button", { name: "Ở lại với bản nháp" }).click();
    await page.route("**/dashboard/account/trees/selection", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 403, body: "denied" })
        : route.continue(),
    );
    await draft
      .getByRole("button", { name: "Chọn lại cây của bản nháp" })
      .click();
    await draft
      .getByRole("alert")
      .filter({ hasText: "Chưa thể khôi phục quyền" })
      .waitFor();
    if (
      !(await draft
        .getByRole("button", { name: "Lưu", exact: true })
        .isDisabled()) ||
      (await name.inputValue()) !== "Bản nháp sẽ bỏ"
    )
      return false;
    await draft.getByRole("button", { name: "Bỏ bản nháp và tải lại" }).click();
    await page
      .getByRole("button", { name: "Xem thông tin Nhà khác" })
      .waitFor();
    await page.unroute("**/dashboard/account/trees/selection");
    return true;
  } finally {
    await selector.goto(
      new URL("/dashboard/account/trees", selector.url()).href,
    );
    if (
      !(await selector
        .getByRole("button", { name: /Gia phả kiểm thử/, pressed: true })
        .count())
    ) {
      await selector.getByRole("button", { name: /Gia phả kiểm thử/ }).click();
      await selector
        .getByRole("button", { name: /Gia phả kiểm thử/, pressed: true })
        .waitFor();
    }
    await selector.close();
  }
}

export async function recoverAvatarPut(page) {
  const keys = new Set();
  let puts = 0,
    writes = 0;
  const url = new URL("/dashboard/members/new", page.url()).href;
  await page.goto(url);
  // Forward actual PUTs to the private test bucket before dropping the browser acknowledgement.
  await page.route(/X-Amz-(Signature|Algorithm)=/i, async (route) => {
    if (route.request().method() === "PUT") {
      keys.add(new URL(route.request().url()).pathname);
      puts++;
    }
    let status = 200;
    if (route.request().method() === "PUT") {
      if (new URL(route.request().url()).hostname !== "127.0.0.1")
        throw new Error(
          "Live object-store tests require a disposable loopback endpoint.",
        );
      status = (await route.fetch()).status();
    }
    await route.fulfill({
      status,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "PUT, OPTIONS",
        "access-control-allow-headers": "*",
      },
      body: "",
    });
  });
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const result = await original(...args);
      if (args[1]?.method === "PUT" && result.ok)
        throw new TypeError("PUT acknowledgement lost");
      return result;
    };
  });
  await page.route("**/dashboard/members/new", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (++writes === 1) {
      await route.fetch();
      return route.abort("failed");
    }
    await route.continue();
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await page.reload();
    await page.waitForLoadState("networkidle");
    await page.locator("input[type=file]").setInputFiles({
      name: "portrait.png",
      mimeType: "image/png",
      buffer: Buffer.from("portrait"),
    });
    await page.locator('img[src^="blob:"]').waitFor();
    await page.locator("input[required]").first().fill("Ảnh sau tải lại");
    await page.locator("button[type=submit]").click();
    if (attempt === 0)
      await page
        .getByText("PUT acknowledgement lost", { exact: true })
        .waitFor();
    if (attempt === 1)
      await page
        .locator("form")
        .getByText(/fetch|network/i)
        .waitFor();
  }
  await page.waitForURL(/\/members\/[0-9a-f-]{36}/, { timeout: 4500 });
  await page.unrouteAll();
  return { keys: keys.size, puts, writes, live:true };
}

export async function reopenLeapDate(page) {
  const edit = page.url();
  const leap = page.getByRole("checkbox", { name: "Tháng nhuận" });
  if (!(await leap.isChecked())) return false;
  await page
    .getByPlaceholder("Thêm thông tin bổ sung, tiểu sử...")
    .fill("Ghi chú sau khi mở lại");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await page
    .getByText("04/02 nhuận/2023", { exact: false })
    .waitFor({ timeout: 5000 });
  await page.goto(edit);
  return (
    (await leap.isChecked()) &&
    (await page
      .getByPlaceholder("Thêm thông tin bổ sung, tiểu sử...")
      .inputValue()) === "Ghi chú sau khi mở lại"
  );
}
