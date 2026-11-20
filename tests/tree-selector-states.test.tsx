import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import FamilyTreesLayout from "@/app/dashboard/account/trees/layout";
import FamilyTreesError from "@/app/dashboard/account/trees/error";
import LoadingTrees from "@/app/dashboard/account/trees/loading";

for (const [state, Component] of [["loading", LoadingTrees], ["error", FamilyTreesError]] as const) {
  test(`the nested ${state} state provides a direct return to the account`, async () => {
    const browser = new Window();
    try {
      browser.document.body.innerHTML = renderToStaticMarkup(<FamilyTreesLayout><Component /></FamilyTreesLayout>);
      const back = browser.document.querySelector('main a[href="/dashboard/account"]');
      expect(back?.textContent).toContain("Tài khoản");
    } finally {
      await browser.close();
    }
  });
}
