export async function formStates(page) {
  const failures = [],
    viewports = [];
  for (const [width, height] of [
    [320, 568],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(new URL("/dashboard/members?view=tree", page.url()).href);
    await page
      .getByRole("button", { name: "Thêm thành viên", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Thêm thành viên",
      exact: true,
    });
    const name = dialog.getByLabel("Họ và tên");
    await name.fill(" ");
    await dialog.getByRole("button", { name: "Lưu" }).click();
    await dialog.getByRole("alert").waitFor();
    const state = await name.evaluate((el) => ({
      invalid: el.getAttribute("aria-invalid"),
      described: document.getElementById(el.getAttribute("aria-describedby"))
        ?.textContent,
      focus: document.activeElement === el,
      radius: getComputedStyle(el).borderRadius,
    }));
    if (
      state.invalid !== "true" ||
      !state.described ||
      !state.focus ||
      state.radius !== "12px"
    )
      failures.push({ width, name: state });
    if (!(await dialog.getByLabel("Tình trạng").count()))
      failures.push({ width, lifeStatus: "missing" });
    const guarded = await page.evaluate(
      () =>
        !window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
    );
    if (!guarded) failures.push({ width, guarded });
    await page.evaluate(() => {
      window.confirm = () => {
        document.body.dataset.treeDraftConfirm = "yes";
        return false;
      };
      history.back();
    });
    try {
      await page.waitForFunction(
        () => document.body.dataset.treeDraftConfirm === "yes",
        null,
        { timeout: 1800 },
      );
    } catch {
      failures.push({ width, backGuard: "missing" });
    }
    if (!(await dialog.isVisible())) {
      failures.push({ width, backDraft: "discarded" });
      continue;
    }
    await page.evaluate(() => {
      window.confirm = () => true;
    });
    const keyboard = await dialog.evaluate(async (el) => {
      const vv = window.visualViewport;
      Object.defineProperty(vv, "height", { configurable: true, value: 295 });
      Object.defineProperty(vv, "offsetTop", { configurable: true, value: 23 });
      vv.dispatchEvent(new Event("resize"));
      vv.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const footer = el
        .querySelector("button[type=submit]")
        .getBoundingClientRect();
      return { bottom: footer.bottom, visibleBottom: vv.offsetTop + vv.height };
    });
    viewports.push({ width, ...state, ...keyboard, guarded });
    if (keyboard.bottom > keyboard.visibleBottom)
      failures.push({ width, keyboard });
    await dialog.getByRole("button", { name: "Hủy" }).click();
    await page.waitForFunction(
      () =>
        !history.state?.personDraft &&
        !document.querySelector("dialog[open]") &&
        window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
    );
  }
  return { failures, viewports };
}

export async function focusModes(page) {
  const failures = [];
  for (const mode of ["mindmap", "bubble"]) {
    await page.goto(
      new URL("/dashboard/members?view=" + mode, page.url()).href,
    );
    await page
      .getByRole("button", { name: "Thêm thành viên", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Thêm thành viên",
      exact: true,
    });
    await dialog.getByLabel("Họ và tên").fill("Mới " + mode);
    await dialog.getByRole("button", { name: "Lưu" }).click();
    try {
      await page.waitForFunction(
        (name) =>
          document.activeElement?.getAttribute("aria-label") ===
          "Xem thông tin " + name,
        "Mới " + mode,
        { timeout: 2500 },
      );
      await page.keyboard.press("Enter");
      await page
        .getByRole("dialog", { name: "Chi tiết thành viên" })
        .waitFor({ timeout: 2500 });
    } catch {
      failures.push(mode);
    }
  }
  return failures;
}

export async function avatarRetry(page) {
  await page.goto(new URL("/dashboard/members/new", page.url()).href);
  let uploads = 0,
    puts = 0,
    writes = 0;
  await page.route("**/api/uploads/presign", async (route) => {
    uploads++;
    await route.continue();
  });
  await page.route(/X-Amz-Signature=/i,async route=>{
    if (route.request().method() !== "PUT") return route.continue();
    puts++;
    const result = await route.fetch();
    await route.fulfill({response:result,headers:{...result.headers(),"access-control-allow-origin":"*"}});
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from("fixture"),
  });
  await page.locator("input[required]").first().fill("Avatar retry");
  await page.route("**/dashboard/members/new", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    writes++;
    if (writes === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  const save = page.locator("button[type=submit]");
  await save.click();
  await save.waitFor({ state: "visible" });
  await page.waitForFunction(
    () => !document.querySelector("button[type=submit]")?.disabled,
  );
  await save.click();
  try {
    await page.waitForURL(/\/members\/[0-9a-f-]{36}/, { timeout: 3500 });
  } catch {}
  return {
    uploads,
    puts,
    writes,
    detail: /\/members\/[0-9a-f-]{36}/.test(page.url()),
  };
}

export async function treeSwitch(page) {
  await page.goto(new URL("/dashboard/members?view=tree", page.url()).href);
  await page
    .getByRole("button", { name: "Thêm thành viên", exact: true })
    .waitFor();
  const selector = await page.context().newPage();
  try {
    await selector.goto(new URL("/dashboard/account/trees", page.url()).href);
    const target = selector.getByRole("button", { name: /Cây thứ hai/ });
    await target.click();
    await selector
      .getByRole("button", { name: /Cây thứ hai/, pressed: true })
      .waitFor({ timeout: 5000 });
    await page.bringToFront();
    try {
      await page
        .getByRole("button", { name: "Xem thông tin Nhà khác" })
        .waitFor({ timeout: 3000 });
    } catch {}
    return {
      newPerson: await page
        .getByRole("button", { name: "Xem thông tin Nhà khác" })
        .count(),
      previousControls: await page
        .getByRole("button", { name: "Thêm thành viên", exact: true })
        .count(),
    };
  } finally {
    await selector.getByRole("button", { name: /Gia phả kiểm thử/ }).click();
    await selector
      .getByRole("button", { name: /Gia phả kiểm thử/, pressed: true })
      .waitFor({ timeout: 5000 });
    await selector.close();
  }
}

export async function historySwitch(page) {
  await page.setViewportSize({ width: 430, height: 932 });
  const url = new URL("/dashboard/account/trees", page.url()).href;
  await page.goto(new URL("/dashboard/members?view=tree", page.url()).href);
  await page
    .getByRole("button", { name: "Thêm thành viên", exact: true })
    .waitFor();
  const account = page
    .getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("link", { name: "Tài khoản" });
  await account.click();
  await page.getByRole("link", { name: "Cây gia phả của tôi" }).click();
  await page.getByRole("button", { name: /Cây thứ hai/ }).click();
  await page
    .getByRole("button", { name: /Cây thứ hai/, pressed: true })
    .waitFor();
  let stage = "first traversal";
  try {
    await page.goBack();
    await page.waitForURL("**/dashboard/account");
    await page.getByRole("link", { name: "Cây gia phả của tôi" }).waitFor();
    await page.waitForFunction(() =>
      document.cookie
        .split("; ")
        .includes("family_tree_revision=" + history.state?.familyTreeRevision),
    );
    await page.goBack();
    const person = page.getByRole("button", { name: "Xem thông tin Nhà khác" });
    await person.waitFor({ timeout: 5000 });
    stage = "second traversal";
    await page.goForward();
    await page.waitForURL("**/dashboard/account");
    await page.getByRole("link", { name: "Cây gia phả của tôi" }).waitFor();
    await page.waitForFunction(() =>
      document.cookie
        .split("; ")
        .includes("family_tree_revision=" + history.state?.familyTreeRevision),
    );
    await page.goBack();
    await person.waitFor({ timeout: 5000 });
    return {
      viewer:
        (await page
          .getByRole("button", { name: "Thêm thành viên", exact: true })
          .count()) === 0,
    };
  } catch (error) {
    return { stage, error: error.message, url: page.url() };
  } finally {
    await page.goto(url);
    await page.getByRole("button", { name: /Gia phả kiểm thử/ }).click();
    await page
      .getByRole("button", { name: /Gia phả kiểm thử/, pressed: true })
      .waitFor();
  }
}
