export async function checkFrozenModal(page, scenario) {
  const treeUrl = new URL("/dashboard/members?view=tree", page.url()).href;
  const selectorUrl = new URL("/dashboard/account/trees", page.url()).href;
  const draft = await page.context().newPage();
  const peer = await page.context().newPage();
  await draft.addInitScript(() => {
    window.addEventListener(
      "popstate",
      () => {
        document.body.dataset.observedPop = "true";
      },
      true,
    );
  });
  const choose = async (pattern) => {
    await page.goto(selectorUrl);
    await page.getByRole("button", { name: pattern }).click();
    await page.getByRole("button", { name: pattern, pressed: true }).waitFor();
  };
  try {
    await choose(/Gia phả kiểm thử/);
    await draft.setViewportSize({ width: 430, height: 932 });
    await draft.goto(new URL("/dashboard/account", treeUrl).href);
    await draft
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("link", { name: "Cây gia phả" })
      .click();
    await draft
      .getByRole("button", { name: "Xem thông tin An", exact: true })
      .click();
    const modal = draft.getByRole("dialog", { name: "Chi tiết thành viên" });
    await modal
      .getByRole("button", { name: "Chỉnh sửa An", exact: true })
      .click();
    const note = modal.locator("textarea");
    const draftValue = "Ghi chú chưa lưu " + scenario;
    await note.fill(draftValue);
    await choose(/Cây thứ hai/);
    await modal.getByRole("button", { name: "Ở lại với bản nháp" }).click();
    const restore = modal.getByRole("button", {
      name: "Chọn lại cây của bản nháp",
    });
    const discard = modal.getByRole("button", {
      name: "Bỏ bản nháp và tải lại",
    });
    const save = modal.getByRole("button", { name: "Lưu thay đổi" });
    const preserved = async () =>
      (await note.isVisible()) &&
      (await note.inputValue()) === draftValue &&
      (await restore.isVisible()) &&
      (await discard.isVisible()) &&
      (await save.isDisabled());
    if (scenario === "restoreRead") {
      await peer.goto(treeUrl);
      await peer
        .getByRole("button", { name: "Xem thông tin Nhà khác" })
        .waitFor();
      let writes = 0,
        reads = 0;
      await draft.route("**/dashboard/account/trees/selection", (route) => {
        if (route.request().method() === "POST") writes++;
        else if (++reads === 1)
          return route.fulfill({
            status: 503,
            body: "temporarily unavailable",
          });
        return route.continue();
      });
      await restore.click();
      await modal
        .getByRole("alert")
        .filter({ hasText: "Chưa thể khôi phục quyền" })
        .waitFor();
      if (!(await preserved()))
        throw Error("Unverified restore released the frozen draft");
      // Peer receives no focus, visibility change or navigation from the test after POST.
      await peer
        .getByRole("button", { name: "Xem thông tin An", exact: true })
        .waitFor({ timeout: 3000 });
      await peer
        .getByRole("button", { name: "Thêm thành viên", exact: true })
        .waitFor();
      await restore.click();
      await save.click();
      await modal.getByText(draftValue, { exact: true }).waitFor();
      if (writes !== 1 || reads !== 2)
        throw Error(
          "Retry must verify the acknowledged selection without a second write",
        );
    } else {
      // Use desktop labels on the modal header while retaining a real prior SPA entry.
      await draft.setViewportSize({ width: 1280, height: 800 });
      if (scenario === "browserBack") {
        await draft.keyboard.press("Escape");
        await draft.evaluate(() => history.back());
        await draft.waitForFunction(
          () => document.body.dataset.observedPop === "true",
        );
      } else {
        const name = scenario === "headerBack" ? "Quay lại" : "Đóng";
        await modal
          .getByRole("button", { name, exact: true })
          .evaluate((el) => el.click());
      }
      // Allow the modal's exit animation to finish if the exit was accepted.
      await note
        .waitFor({ state: "hidden", timeout: 650 })
        .catch(() => undefined);
      if (
        !(await preserved()) ||
        !new URL(draft.url()).searchParams.has("memberModalId")
      )
        throw Error(
          scenario +
            " discarded the frozen form or removed its recovery actions",
        );
      await discard.click();
      await draft
        .getByRole("button", { name: "Xem thông tin Nhà khác" })
        .waitFor();
      if (await modal.isVisible())
        throw Error("Discard retained the previous tree's modal");
    }
    return true;
  } finally {
    await draft.close();
    await peer.close();
    await choose(/Gia phả kiểm thử/);
  }
}
