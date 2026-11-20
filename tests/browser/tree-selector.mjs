// Executed inside Playwright CLI's run-code environment against a real authenticated account.
export default async function checkSelector(page) {
  page.setDefaultTimeout(6000);
  const failures = [];
  const sizes = [[320, 568], [430, 932], [1280, 800]];
  const viewports = [];
  function check(condition, message) {
    if (!condition) failures.push(message);
  }
  await page.goto(new URL("/dashboard/account", page.url()).href);
  await page.getByRole("link", { name: "Cây gia phả của tôi" }).click();
  await page.getByRole("heading", { name: "Cây gia phả của tôi" }).waitFor();
  const input = page.getByRole("textbox", { name: "Tên cây gia phả" });
  await input.waitFor();
  const create = page.getByRole("button", { name: "Tạo cây gia phả", exact: true });
  const longName = "Nguyễn".repeat(20);
  const shortTree = page.getByRole("button", { name: /Họ Bùi.*Chủ sở hữu/ });
  const longTree = page.getByRole("button", { name: new RegExp(longName) });
  const cdp = await page.context().newCDPSession(page);
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom: 0 } });
    const padding = () => page.locator("main").evaluate(el => parseFloat(getComputedStyle(el).paddingBottom));
    const baseline = await padding();
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom: 34 } });
    const extraPadding = await padding();
    check(extraPadding === baseline + 34, width + ": safe area was not added to bottom spacing");

    const geometry = await page.locator("main").evaluate(main => {
      const style = el => {
        const css = getComputedStyle(el);
        return [css.fontSize, css.lineHeight, css.fontFamily];
      };
      return {
        scrollWidth: document.documentElement.scrollWidth,
        minTarget: Math.min(...Array.from(main.querySelectorAll("button,input:not([type=hidden]),a"), el => {
          const rect = el.getBoundingClientRect();
          return Math.min(rect.width, rect.height);
        })),
        h1: style(main.querySelector("h1")),
        h2s: Array.from(main.querySelectorAll("h2"), style),
        uiFont: getComputedStyle(document.body).fontFamily,
        inputRadius: getComputedStyle(main.querySelector("input[name=name]")).borderRadius,
      };
    });
    check(geometry.scrollWidth === width, width + ": document overflow");
    check(geometry.minTarget >= 44, width + ": undersized target");
    check(geometry.h1.join("|") === ["26px","34px",geometry.uiFont].join("|"), width + ": H1 typography");
    check(geometry.h2s.every(h => h.join("|") === ["22px","30px",geometry.uiFont].join("|")), width + ": H2 typography");
    check(geometry.inputRadius === "12px", width + ": input corner radius");
    const shortBox = await shortTree.boundingBox();
    const longBox = await longTree.boundingBox();
    check(longBox.height > shortBox.height && longBox.x + longBox.width <= width, width + ": long name did not wrap inside viewport");

    await shortTree.evaluate(el => el.scrollIntoView({ block: "center" }));
    const hit = await shortTree.boundingBox();
    const point = { x: hit.x + hit.width / 2, y: hit.y + hit.height / 2 };
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    const colors = () => shortTree.evaluate(el => getComputedStyle(el).backgroundColor);
    const before = await colors();
    check(await shortTree.evaluate((el, {x, y}) => el.contains(document.elementFromPoint(x, y)), point), width + ": touch point was covered");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const held = await colors();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    check(await colors() === before, width + ": touch cancellation did not restore button");
    check(before !== held, width + ": no immediate touch feedback");
    await page.getByRole("link", { name: "← Tài khoản", exact: true }).focus();
    await page.keyboard.press("Tab");
    check(await page.locator("button[aria-pressed]").first().evaluate(el => el.matches(":focus-visible")), width + ": keyboard focus did not reach first tree");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "selector-" + width + ".png" });
    viewports.push({ width, height, ...geometry, baseline, extraPadding, shortHeight: shortBox.height, longHeight: longBox.height, before, held });
  }
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    try {
      await input.fill("   ");
      await input.press("Enter");
      await page.getByRole("alert").filter({ hasText: /Vui lòng nhập tên cây/ }).waitFor();
      await shortTree.focus();
      await shortTree.press("Space");
      await page.getByRole("button", { name: /Họ Bùi/, pressed: true }).waitFor();
      await page.getByRole("status").filter({ hasText: "Đã chuyển cây gia phả." }).waitFor();
      check(await page.locator("main [role=alert]").count() === 0, width + ": stale create error remained after switching");
      await longTree.press("Enter");
      await page.getByRole("button", { name: new RegExp(longName), pressed: true }).waitFor();
      check(await page.locator("main [role=alert]").count() === 0, width + ": stale create error reappeared after switching back");
      await input.fill("");
    } catch (error) {
      failures.push(width + ": switch workflow: " + error.message);
      break;
    }
  }
  try {
    await input.fill("Cây vừa tạo");
    await create.press("Enter");
    await page.getByRole("button", { name: /Cây vừa tạo.*Chủ sở hữu/, pressed: true }).waitFor();
  } catch (error) {
    failures.push("Create workflow: " + error.message);
  }
  await cdp.detach();
  return { viewports, failures };
}

export async function checkRevokedSelection(page) {
  await page.getByRole("button", { name: /Cây vừa tạo/ }).press("Space");
  await page.getByRole("alert").filter({ hasText: "Bạn không có quyền chọn cây gia phả này." }).waitFor();
  const name = page.getByRole("textbox", { name: "Tên cây gia phả" });
  await name.fill("Cây mới của gia đình");
  await name.press("Enter");
  await page.getByRole("button", { name: /Cây mới của gia đình/, pressed: true }).waitFor();
  return await page.locator("main [role=alert]").count() === 0;
}

export async function checkSnapshotRecovery(page) {
  const path = "**/dashboard/account/trees/selection";
  const results = [];
  for (const operation of ["create", "select"]) {
    let writes = 0;
    let reads = 0;
    await page.route(path, async route => {
      const method = route.request().method();
      if (method === "POST") writes++;
      if (method === "GET" && ++reads === 1) {
        await route.fulfill({ status: 503, body: "Snapshot temporarily unavailable" });
      } else {
        await route.continue();
      }
    });
    try {
      const committed = page.waitForResponse(r => r.url().endsWith("/trees/selection") && r.request().method() === "POST");
      if (operation === "create") {
        const input = page.getByRole("textbox", { name: "Tên cây gia phả" });
        await input.fill("Cây kiểm tra tải lại");
        await input.press("Enter");
      } else {
        await page.getByRole("button", { name: /Họ Bùi/ }).press("Space");
      }
      const response = await committed;
      const { notice } = await response.json();
      const cookie = (await page.context().cookies()).find(c => c.name === "family_tree_selected");
      if (!response.ok() || !notice.treeId || cookie?.value !== notice.treeId) throw new Error("Lost mutation acknowledgement or cookie");
      const reload = page.getByRole("button", { name: "Tải lại danh sách" });
      await reload.waitFor({ timeout: 4000 });
      await page.getByRole("status").filter({ hasText: notice.message }).waitFor();
      if (await page.locator("main form").count()) throw new Error("A mutation form is still available during recovery");
      await reload.press("Enter");
      await page.locator('button[aria-pressed="true"][value="' + notice.treeId + '"]').waitFor();
      if (await page.getByRole("textbox", { name: "Tên cây gia phả" }).inputValue()) throw new Error("Committed draft remained");
      if (writes !== 1 || reads !== 2) throw new Error("Recovery must retry only the snapshot GET");
      results.push({ operation, writes, reads });
    } finally {
      await page.unroute(path);
    }
  }
  return results;
}
