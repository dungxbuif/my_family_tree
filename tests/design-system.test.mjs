import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("runtime exposes the approved Heritage Modern semantic tokens", async () => {
  const css = await read("app/globals.css");
  const login = await read("app/login/page.tsx");

  for (const declaration of [
    "--gp-brand-primary: #174d2a",
    "--gp-brand-primary-dark: #103c23",
    "--gp-accent-gold: #a47b24",
    "--gp-surface-canvas: #fbf7f0",
    "--gp-surface-card: #fffdf9",
  ]) {
    assert.match(css.toLowerCase(), new RegExp(declaration));
  }

  assert.match(css, /--color-primary:\s*var\(--gp-brand-primary\)/);
  assert.match(css, /--color-stone-900:\s*var\(--gp-brand-primary-dark\)/);
  assert.match(css, /--color-amber-600:\s*var\(--gp-accent-gold\)/);
  assert.match(css, /--color-sky-600:\s*var\(--gp-brand-primary\)/);
  assert.match(css, /--color-rose-600:\s*var\(--gp-accent-gold\)/);
  assert.match(css, /--color-emerald-600:\s*var\(--gp-status-success\)/);
  assert.doesNotMatch(css, /backdrop-blur|bg-white\/(?:50|60|70|80|90|95)/);
  assert.doesNotMatch(login, /#fafaf9|#fef3c7/i);
  assert.match(login, /var\(--gp-accent-gold-soft\)/);
  assert.doesNotMatch(login, /href=["']\/["']/);
});

test("layout loads Vietnamese-first UI and editorial fonts", async () => {
  const layout = await read("app/layout.tsx");

  assert.match(layout, /Be_Vietnam_Pro/);
  assert.match(layout, /Noto_Serif/);
  assert.doesNotMatch(layout, /\bInter\b|Playfair_Display/);
});

test("repository contains the complete approved visual handoff", async () => {
  const tokens = JSON.parse(await read("docs/design/tokens/design-tokens.json"));
  assert.equal(tokens.color.brand.primary, "#174D2A");
  assert.equal(tokens.color.accent.gold, "#A47B24");

  for (const path of [
    "docs/design/tokens/theme.css",
    "docs/design/assets/icons/brand-tree.svg",
    "docs/design/assets/icons/branch.svg",
    "docs/design/assets/icons/leaf.svg",
    "docs/design/assets/illustrations/empty-tree.svg",
    "docs/design/assets/mockups/01-home.png",
    "docs/design/assets/mockups/02-family-tree.png",
    "docs/design/assets/mockups/03-member-detail.png",
    "docs/design/assets/mockups/04-member-form.png",
  ]) {
    const file = await read(path).catch(() => null);
    assert.notEqual(file, null, `missing ${path}`);
  }
});

test("components use solid Heritage Modern surfaces instead of glass styling", async () => {
  const roots = ["app", "components", "context"];
  const files = (
    await Promise.all(
      roots.map((root) =>
        readdir(new URL(`../${root}`, import.meta.url), {
          recursive: true,
          withFileTypes: true,
        }).then((entries) =>
          entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
            .map((entry) => `${entry.parentPath}/${entry.name}`),
        ),
      ),
    )
  ).flat();

  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(source, /backdrop-blur(?:-\w+)?/);
  assert.doesNotMatch(source, /bg-white\/(?:50|60|70|80|90|95)/);
  assert.doesNotMatch(source, /shadow-(?:xl|2xl)/);
  assert.doesNotMatch(source, /#(?:fafaf9|fef3c7|f5f5f4|d6d3d1|3b82f6|ec4899|44403c)/i);
  assert.doesNotMatch(source, /from-(?:sky|rose|pink|orange)-|to-(?:sky|rose|pink|orange)-/);
});

test("root route sends family members directly to login", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /redirect\(["']\/login["']\)/);
  assert.doesNotMatch(page, /LandingHero|Gia phả gia đình|Đăng nhập để xem thông tin/);
});

test("primary routes compose the shared Heritage component foundation", async () => {
  const index = await read("components/heritage/index.ts");
  const dashboard = await read("app/dashboard/page.tsx");
  const layout = await read("app/dashboard/layout.tsx");

  for (const component of [
    "HeritageHeader",
    "HeritageBottomNav",
    "HeritageBanner",
    "HeritageSurface",
    "HeritageMetricCard",
    "HeritagePersonCard",
    "HeritageEventRow",
    "HeritagePageHero",
  ]) {
    assert.match(index, new RegExp(component));
  }

  assert.match(dashboard, /HeritageBanner/);
  assert.match(dashboard, /HeritageMetricCard/);
  assert.match(dashboard, /HeritagePersonCard/);
  assert.match(dashboard, /HeritageEventRow/);
  assert.match(layout, /HeritageHeader/);
  assert.match(layout, /HeritageBottomNav/);
});
