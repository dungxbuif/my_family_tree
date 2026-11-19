export default async function checkMembership(page, email, selectedPerson) {
  page.setDefaultTimeout(6000);
  const root = "/dashboard/account/trees/access";
  await page.goto(new URL("/dashboard/account/trees", page.url()).href);
  await page.getByRole("link", { name: "Quản lý quyền truy cập" }).click();
  const link = name => page.getByRole("link", { name, exact: true });
  const button = name => page.getByRole("button", { name, exact: true });
  const emailField = page.getByLabel("Email đầy đủ của tài khoản");
  const saved = () => page.getByRole("status").filter({ hasText: "Đã cập nhật quyền truy cập." }).waitFor();
  const row = () => page.locator("li").filter({ has: page.getByRole("heading", { name: email, exact: true }) });
  function check(condition, message) { if (!condition) throw Error(message); }
  const dimensions = [];
  async function measure(screen) {
    for (const [width, height] of [[320,568],[430,932],[1280,800]]) {
      await page.setViewportSize({ width, height });
      const metrics = await page.locator("main").evaluate(el => ({
        width: document.documentElement.scrollWidth,
        primaryHeight: el.querySelector("button[type=submit]")?.getBoundingClientRect().height,
        minTarget: Math.min(...Array.from(el.querySelectorAll("a,button,select,input:not([type=hidden]):not([type=checkbox])"), node => {
          const rect = node.getBoundingClientRect(); return Math.min(rect.width, rect.height);
        })),
      }));
      check(metrics.width === width && metrics.minTarget >= 44, screen + ": " + JSON.stringify(metrics));
      if (screen === "add") check(metrics.primaryHeight === 52, "primary CTA height " + metrics.primaryHeight);
      dimensions.push({ screen, width, height, ...metrics });
      await page.screenshot({ path: screen + "-" + width + ".png" });
    }
    await page.setViewportSize({ width: 320, height: 568 });
  }

  await link("Thêm quyền truy cập").click();
  await measure("add");
  await page.context().setOffline(true);
  await page.getByRole("status").filter({ hasText: "Đã mất kết nối" }).waitFor();
  check(await button("Thêm quyền truy cập").isDisabled(), "offline form enabled");
  await page.context().setOffline(false);
  const requests = [];
  page.on("request", request => { if (request.url().includes(root)) requests.push(request.method()); });
  await emailField.fill("prefix");
  check(await emailField.getAttribute("autocomplete") === "off", "email autocomplete");
  check(await page.getByRole("listbox").count() === 0 && requests.length === 0, "typing requested account data");
  await page.evaluate(() => { window.confirm = message => { document.body.dataset.confirmMessage = message; return false; }; });
  await link("Xem quyền truy cập").click();
  check(Boolean(await page.locator("body").getAttribute("data-confirm-message")), "navigation skipped draft confirmation");
  check(await emailField.inputValue() === "prefix", "draft lost on cancel");
  await emailField.fill("missing-" + email);
  await button("Thêm quyền truy cập").click();
  await page.getByRole("alert").filter({ hasText: "Không thể thực hiện" }).waitFor();
  check(await emailField.inputValue() === "missing-" + email, "draft lost after rejection");
  await emailField.fill("\u00a0" + email.toUpperCase() + "\u3000");
  await button("Thêm quyền truy cập").click();
  await saved();
  await row().getByText("Người xem", { exact: true }).waitFor();
  await measure("members");
  await row().getByRole("link", { name: "Đổi vai trò" }).click();
  await page.getByLabel("Vai trò").selectOption("editor");
  await button("Đổi vai trò").click();
  await saved();
  await row().getByText("Biên tập viên", { exact: true }).waitFor();
  await link("Liên kết hồ sơ").click();
  await emailField.fill(email);
  const options = page.getByLabel("Hồ sơ gia phả").locator("option").filter({ hasText: "Người liên kết" });
  const labels = await options.allTextContents();
  check(labels.length === 2 && new Set(labels).size === 2, "same-name Person labels are identical");
  const intended = labels.find(label => label.includes(selectedPerson.slice(0, 8)));
  check(Boolean(intended), "intended Person not identifiable");
  await page.getByLabel("Hồ sơ gia phả").selectOption({ label: intended });
  await button("Liên kết hồ sơ").click();
  await saved();
  const unlink = row().getByRole("link", { name: "Gỡ liên kết" });
  check((await unlink.getAttribute("href")).includes("personId=" + selectedPerson), "linked the other same-name Person");
  await unlink.click();
  await button("Gỡ liên kết").click();
  check(!(await page.getByRole("checkbox").isChecked()), "unlink preconfirmed");
  await page.getByRole("checkbox").check();
  await button("Gỡ liên kết").click();
  await saved();
  await row().getByRole("link", { name: "Gỡ quyền truy cập" }).click();
  await button("Gỡ quyền truy cập").click();
  check(!(await page.getByRole("checkbox").isChecked()), "removal preconfirmed");
  await page.getByRole("checkbox").check();

  // Lose the response after the real commit. Recovery must only read.
  let posts = 0;
  await page.route("**/access/mutation", async route => {
    posts++;
    await route.fetch();
    await route.abort("failed");
  });
  await button("Gỡ quyền truy cập").click();
  await link("Tải lại danh sách").waitFor();
  check(await page.locator("main form").count() === 0, "ambiguous write still offers a mutation");
  const [currentList] = await Promise.all([page.waitForEvent("popup"), link("Tải lại danh sách").click()]);
  await currentList.getByText("Chỉ bạn có quyền truy cập cây gia phả này.").waitFor();
  await currentList.close();
  check(posts === 1, "removal was retried");
  return { dimensions, recoveredAfterLostResponse: true, removalPosts: posts };
}

export async function checkUnconfirmedDrafts(initialPage, email, personId) {
  const root = "/dashboard/account/trees/access";
  const issues = [];
  let writes = 0;
  const context = initialPage.context();
  await context.route("**/access/mutation", async route => { writes++; await route.abort("failed"); });
  for (const [operation, label] of [["add", "Thêm quyền truy cập"], ["link", "Liên kết hồ sơ"]]) {
    const page = await context.newPage();
    await page.goto(new URL(root, initialPage.url()).href);
    await page.getByRole("link", { name: label, exact: true }).click();
    const field = page.getByLabel("Email đầy đủ của tài khoản");
    const raw = "\u00a0" + email.toUpperCase() + "\u3000";
    await field.fill(raw);
    if (!await field.evaluate(el => el.validity.valid)) issues.push("browser blocked Unicode-wrapped mailbox");
    await field.fill(email);
    if (operation === "add") await page.getByLabel("Vai trò").selectOption("editor");
    else {
      const picker = page.getByLabel("Hồ sơ gia phả");
      const labels = await picker.locator("option").filter({ hasText: "Người liên kết" }).allTextContents();
      if (new Set(labels).size !== 2) issues.push("identical Person labels");
      await picker.selectOption(personId);
    }
    await page.getByRole("button", { name: label }).click();
    await page.getByRole("alert").filter({ hasText: "Chưa thể xác nhận" }).waitFor();
    const draft = page.getByRole("region", { name: "Thông tin đã gửi" });
    if (await draft.count() !== 1) { issues.push(operation + " draft hidden"); await page.close(); continue; }
    const contents = await draft.innerText();
    if (!contents.includes(email) || !contents.includes(operation === "add" ? "Biên tập viên" : personId.slice(0,8))) {
      issues.push(operation + " draft lost submitted values");
    }
    await page.evaluate(() => { window.confirm = () => { document.body.dataset.draftGuard = "yes"; return false; }; });
    await page.getByRole("link", { name: "← Tài khoản", exact: true }).click();
    if (await page.locator("body").getAttribute("data-draft-guard") !== "yes") issues.push(operation + " draft guard inactive");
    const [list] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("link", { name: /Tải lại danh sách/ }).click(),
    ]);
    await list.getByRole("heading", { name: "Quản lý quyền truy cập" }).waitFor();
    await list.close();
    if (!await draft.isVisible() || await page.locator("main form").count()) issues.push(operation + " recovery lost draft or enabled writes");
    await page.close();
  }
  await context.unroute("**/access/mutation");
  if (writes !== 2) issues.push("recovery repeated a write");
  if (issues.length) throw Error(issues.join("; "));
  return { draftsPreserved: 2, writeCount: writes };
}
