import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import AccessError from "@/app/(tree-access)/dashboard/account/trees/access/error";
import LoadingAccess from "@/components/AccessLoading";
import FamilyTreesLayout from "@/app/dashboard/account/trees/layout";

test("access loading and read recovery retain a path back to the account and offer a GET retry", async () => {
  const browser = new Window();
  try {
    const body = browser.document.body;
    body.innerHTML = renderToStaticMarkup(<FamilyTreesLayout><LoadingAccess /></FamilyTreesLayout>);
    expect(body.querySelector("[role=status]")?.textContent).toContain("Đang tải");
    expect(body.querySelector('a[href="/dashboard/account"]')).toBeTruthy();
    body.innerHTML = renderToStaticMarkup(<FamilyTreesLayout><AccessError /></FamilyTreesLayout>);
    expect(body.querySelector("[role=alert]")).toBeTruthy();
    expect(body.querySelector('a[href="/dashboard/account/trees/access"]')?.textContent).toBe("Tải lại danh sách");
    expect(body.querySelector("form")).toBeNull();
  } finally { await browser.close(); }
});
