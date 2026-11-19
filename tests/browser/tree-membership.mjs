export default async function checkMembership(page, email) {
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
        minTarget: Math.min(...Array.from(el.querySelectorAll("a,button,select,input:not([type=hidden]):not([type=checkbox])"), node => {
          const rect = node.getBoundingClientRect(); return Math.min(rect.width, rect.height);
        })),
      }));
      check(metrics.width === width && metrics.minTarget >= 44, screen + ": " + JSON.stringify(metrics));
      dimensions.push({ screen, width, height, minTarget: metrics.minTarget });
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
  await emailField.fill(email.toUpperCase());
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
  await page.getByLabel("Hồ sơ gia phả").selectOption({ label: "Người liên kết" });
  await button("Liên kết hồ sơ").click();
  await saved();
  await row().getByRole("link", { name: "Gỡ liên kết" }).click();
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
  await link("Tải lại danh sách").click();
  await page.getByText("Chỉ bạn có quyền truy cập cây gia phả này.").waitFor();
  check(posts === 1, "removal was retried");
  return { dimensions, recoveredAfterLostResponse: true, removalPosts: posts };
}
