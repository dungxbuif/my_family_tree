export default async function checkAdd(page) {
  page.setDefaultTimeout(5000);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(new URL("/dashboard/members?view=tree", page.url()).href);
  const add = page.getByRole("button", {
    name: "Thêm thành viên",
    exact: true,
  });
  await add.click();
  const dialog = page.getByRole("dialog", {
    name: "Thêm thành viên",
    exact: true,
  });
  const viewports = [];
  const cdp = await page.context().newCDPSession(page);
  for (const [width, height] of [
    [320, 568],
    [430, 932],
    [1280, 800],
  ]) {
    await page.setViewportSize({ width, height });
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { bottom: 34 },
    });
    if (width < 768) {
      await page.waitForFunction(
        () =>
          document
            .querySelector("dialog.tree-add-dialog[open]")
            ?.getBoundingClientRect().height === visualViewport.height,
      );
    }
    const result = await dialog.evaluate((el) => ({
      width: innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      minTarget: Math.min(
        ...[...el.querySelectorAll("input,select,button")].map((control) => {
          const box = control.getBoundingClientRect();
          return Math.min(box.width, box.height);
        }),
      ),
      saveHeight: el
        .querySelector("button[type=submit]")
        .getBoundingClientRect().height,
      saveBottom: el
        .querySelector("button[type=submit]")
        .getBoundingClientRect().bottom,
      saveReachable: (() => {
        const button = el.querySelector("button[type=submit]");
        const rect = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      })(),
    }));
    if (
      result.width !== result.pageWidth ||
      result.minTarget < 44 ||
      result.saveHeight !== 52 ||
      result.saveBottom > height - 34 || !result.saveReachable
    )
      throw new Error(JSON.stringify(result));
    await page.screenshot({ path: "tree-add-" + width + ".png" });
    viewports.push(result);
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await dialog.getByLabel("Họ và tên").fill("   ");
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await dialog.getByRole("alert").waitFor();
  if ((await dialog.getByLabel("Họ và tên").inputValue()) !== "   ")
    throw new Error("Rejected draft was cleared.");
  await dialog.getByLabel("Họ và tên").fill("Người mới");
  await dialog.getByRole("button", { name: "Lưu" }).click();
  const node = page.getByRole("button", { name: "Xem thông tin Người mới" });
  await node.waitFor();
  await page.getByRole("button", { name: "Phóng to sơ đồ" }).click();
  await node.click();
  const viewport = () =>
    page.locator("#export-container").evaluate((el) => ({
      x: el.parentElement.scrollLeft,
      y: el.parentElement.scrollTop,
      scale: el.style.transform,
    }));
  await page.locator("#export-container").evaluate((el) => {
    el.parentElement.scrollLeft = 7;
  });
  const beforeCancel = await viewport();
  const detail = page.getByRole("dialog", { name: "Chi tiết thành viên" });
  await detail
    .getByRole("button", { name: "Thêm thành viên", exact: true })
    .click();
  await dialog.getByLabel("Quan hệ").selectOption("child");
  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await dialog.getByRole("button", { name: "Hủy" }).click();
  if (JSON.stringify(await viewport()) !== JSON.stringify(beforeCancel))
    throw new Error("Cancel moved the graph.");
  await detail
    .getByRole("button", { name: "Thêm thành viên", exact: true })
    .click();
  await dialog.getByLabel("Họ và tên").fill("Con của người mới");
  await dialog.getByLabel("Quan hệ").selectOption("child");
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await page
    .getByRole("button", { name: "Xem thông tin Con của người mới" })
    .waitFor();
  const focused = new URL(page.url()).searchParams.get("rootId");
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("aria-label") ===
      "Xem thông tin Con của người mới",
    null,
    { timeout: 5000 },
  );
  await detail.waitFor({ state: "hidden" });
  await add.click();
  await dialog.getByLabel("Họ và tên").fill("Bản nháp");
  return { viewports, focused, beforeCancel };
}

export async function checkDemotion(page) {
  const dialog = page.getByRole("dialog", {
    name: "Thêm thành viên",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await dialog.getByRole("alert").filter({ hasText: "Từ chối" }).waitFor();
  if ((await dialog.getByLabel("Họ và tên").inputValue()) !== "Bản nháp")
    throw new Error("Demotion cleared the draft.");
  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await dialog.getByRole("button", { name: "Hủy" }).click();
  await page.waitForFunction(
    () =>
      !history.state?.personDraft && !document.querySelector("dialog[open]"),
  );
  await page.reload();
  const node = page.getByRole("button", {
    name: "Xem thông tin Con của người mới",
  });
  await node.waitFor();
  const add = page.getByRole("button", {
    name: "Thêm thành viên",
    exact: true,
  });
  if (await add.count())
    throw new Error("Viewer can see the graph mutation control.");
  await node.click();
  await page
    .getByRole("dialog", { name: "Chi tiết thành viên" })
    .getByText("Thông tin liên hệ chỉ hiển thị", { exact: false })
    .waitFor();
  if (await add.count())
    throw new Error("Viewer can see the contextual mutation control.");
  return { draftPreserved: true, mutationControls: 0 };
}
