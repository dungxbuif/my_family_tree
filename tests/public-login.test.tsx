import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import LoginPage from "@/app/login/page";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

test("the public login form offers only sign-in", () => {
  const html = renderToStaticMarkup(<LoginPage />);

  expect(html).toContain("Đăng nhập");
  expect(html).toContain('name="email"');
  expect(html).toContain('name="password"');
  expect(html).not.toContain("Đăng ký");
  expect(html).not.toContain('href="/about"');
});

test("a stale session cookie can reach the login form", () => {
  const request = new NextRequest("http://localhost/login", {
    headers: { cookie: "family_tree_session=revoked-session" },
  });

  expect(proxy(request).headers.get("location")).toBeNull();
});
