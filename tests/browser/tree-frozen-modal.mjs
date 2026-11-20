export async function checkFrozenModal(page, scenario) {
  const treeUrl = new URL("/dashboard/members?view=tree", page.url()).href;
  const selectorUrl = new URL("/dashboard/account/trees", page.url()).href;
  const draft = await page.context().newPage();
  const peer = await page.context().newPage();
  const backFirst = scenario.startsWith("backFirst");
  const historyCheck = backFirst || scenario.startsWith("storageFirst");
  const sameUrl = scenario.includes("SameUrl");
  await draft.addInitScript((legacy) => {
    const native = window.navigation;
    if (legacy) {
      delete window.navigation;
      if ("navigation" in window) throw Error("Unable to hide the Navigation API");
    }
    window.draftTraversals = [];
    window.historySnapshot = () => ({
      key: native.currentEntry.key,
      index: native.currentEntry.index,
      keys: native.entries().map((entry) => entry.key),
      url: location.href,
    });
    window.addEventListener(
      "popstate",
      () => {
        document.body.dataset.observedPop = "true";
        window.draftTraversals.push(native.currentEntry.key);
      },
      true,
    );
  }, scenario.endsWith("Legacy"));
  const snapshot = () => draft.evaluate(() => window.historySnapshot());
  const waitForEntry = (key) =>
    draft.waitForFunction((key) => window.historySnapshot().key === key, key);
  const choose = async (pattern) => {
    await page.goto(selectorUrl);
    await page.getByRole("button", { name: pattern }).click();
    await page.getByRole("button", { name: pattern, pressed: true }).waitFor();
  };
  try {
    await choose(/Gia phả kiểm thử/);
    await draft.setViewportSize({ width: 430, height: 932 });
    await draft.goto(new URL("/dashboard/account", treeUrl).href);
    const nav = draft.getByRole("navigation", { name: "Điều hướng chính" });
    await nav.getByRole("link", { name: "Cây gia phả" }).click();
    if (historyCheck && !sameUrl) {
      await draft.waitForURL(treeUrl);
      await nav.getByRole("link", { name: "Thành viên" }).click();
      await draft.waitForURL(/view=list/);
      await draft.evaluate(() => history.back());
      await draft.waitForURL(treeUrl);
    }
    await draft
      .getByRole("button", { name: "Xem thông tin An", exact: true })
      .click();
    const modal = draft.getByRole("dialog", { name: "Chi tiết thành viên" });
    const edit = modal.getByRole("button", {
      name: "Chỉnh sửa An",
      exact: true,
    });
    if (sameUrl) {
      await edit.waitFor();
      const details = await snapshot();
      await modal.getByRole("button", { name: "Thêm thành viên" }).click();
      const add = draft.getByRole("dialog", { name: "Thêm thành viên" });
      await add.waitFor();
      const contextual = await snapshot();
      if (
        contextual.key === details.key ||
        contextual.url !== details.url ||
        contextual.keys[contextual.index - 1] !== details.key
      )
        throw Error("Contextual Add must push a distinct entry at the details URL");
      await add.getByRole("button", { name: "Hủy", exact: true }).click();
      await waitForEntry(details.key);
      await draft.evaluate(() => history.forward());
      await waitForEntry(contextual.key);
      await add.waitFor({ state: "hidden" });
    }
    await edit.click();
    const note = modal.locator("textarea");
    const draftValue = "Ghi chú chưa lưu " + scenario;
    await note.fill(draftValue);
    const entry =
      historyCheck &&
      (await draft.evaluate(() => {
        window.draftTraversals = [];
        return window.historySnapshot();
      }));
    const stay = modal.getByRole("button", { name: "Ở lại với bản nháp" });
    if (backFirst) {
      // Commit through the selector's real endpoint in the other tab, before it broadcasts.
      await page
        .getByRole("button", { name: /Cây thứ hai/ })
        .evaluate(async (button) => {
          const response = await fetch("/dashboard/account/trees/selection", {
            method: "POST",
            headers: { "X-Requested-With": "FamilyTreeSelector" },
            body: new FormData(button.form, button),
          });
          if (
            !response.ok ||
            (await response.json()).notice.treeId !== button.value
          )
            throw Error("The other tab failed to select the second tree");
        });
      if (await stay.isVisible()) throw Error("Draft froze before Back");
    } else {
      await choose(/Cây thứ hai/);
      if (historyCheck) await stay.waitFor();
    }
    if (historyCheck) await draft.evaluate(() => history.back());
    await stay.click();
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
    if (historyCheck) {
      await draft
        .waitForFunction(
          (key) =>
            window.historySnapshot().key === key &&
            window.draftTraversals.length >= 2,
          entry.key,
          { timeout: 3000 },
        )
        .catch(async () => {
          throw Error(
            `${scenario} expected to return to ${entry.key}, observed ${(await snapshot()).key}`,
          );
        });
      const observed = await draft.evaluate(() => ({
        traversals: window.draftTraversals,
        keys: window.historySnapshot().keys,
      }));
      if (
        JSON.stringify(observed.keys) !== JSON.stringify(entry.keys) ||
        JSON.stringify(observed.traversals) !==
          JSON.stringify([entry.keys[entry.index - 1], entry.key]) ||
        draft.url() !== entry.url ||
        !(await preserved())
      )
        throw Error(
          scenario + " changed the history stack or lost the dirty editor",
        );
      const [verification] = await Promise.all([
        draft.waitForResponse(
          (response) =>
            response.url() === selectorUrl + "/selection" &&
            response.request().method() === "GET" &&
            response.ok(),
        ),
        restore.click(),
      ]);
      const verified = await verification.json();
      const membership = verified.trees.find((tree) => tree.id === verified.currentId);
      if (membership?.name !== "Gia phả kiểm thử" || membership.role !== "editor")
        throw Error("Restore did not verify the editor's original tree");
      await modal
        .getByRole("button", { name: "Lưu thay đổi", disabled: false })
        .waitFor();
      if (
        (await snapshot()).key !== entry.key ||
        draft.url() !== entry.url ||
        (await note.inputValue()) !== draftValue
      )
        throw Error("Verified tree restore changed the modal entry or draft");
      await save.click();
      await note.waitFor({ state: "detached" });
      await modal
        .getByRole("button", { name: "Chỉnh sửa An", exact: true })
        .waitFor();
      await modal.getByText(draftValue, { exact: true }).waitFor();
      if (sameUrl) {
        await draft.evaluate(() => history.back());
        await waitForEntry(entry.keys[entry.index - 1]);
        await modal.getByText(draftValue, { exact: true }).waitFor();
        await draft.evaluate(() => history.forward());
        await waitForEntry(entry.key);
        await modal.getByText(draftValue, { exact: true }).waitFor();
        if (JSON.stringify((await snapshot()).keys) !== JSON.stringify(entry.keys))
          throw Error("Save or Back/Forward replaced an original entry");
        return true;
      }
      await draft.evaluate(() => history.forward());
      await draft.waitForURL(/view=list/);
      await nav
        .locator('a[aria-current="page"]')
        .filter({ hasText: "Thành viên" })
        .waitFor();
      if (
        (await draft.evaluate(() => window.historySnapshot().key)) !==
        entry.keys[entry.index + 1]
      )
        throw Error("Forward did not reach the original list entry");
      await draft.evaluate(() => history.back());
      await draft.waitForURL(entry.url);
      await modal.getByText(draftValue, { exact: true }).waitFor();
      await draft.evaluate(() => history.back());
      await draft.waitForURL(/\/dashboard\/account$/);
      await nav
        .locator('a[aria-current="page"]')
        .filter({ hasText: "Tài khoản" })
        .waitFor();
      if (
        (await draft.evaluate(() => window.historySnapshot().key)) !==
        entry.keys[entry.index - 1]
      )
        throw Error("Back did not reach the original account entry");
    } else if (scenario === "restoreRead") {
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
