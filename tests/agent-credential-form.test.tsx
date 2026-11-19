import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import AgentCredentials from "@/components/AgentCredentials";

test("the credential form defaults to read-only and keeps its optional expiration field labelled", async () => {
  const window = new Window();
  try {
    window.document.body.innerHTML = renderToStaticMarkup(
      <AgentCredentials initial={[]} />,
    );
    const form = window.document.querySelector("form")!;
    expect(
      [...form.querySelectorAll<HTMLInputElement>("input:checked")].map(
        (i) => i.value,
      ),
    ).toEqual(["read"]);
    expect(
      form.querySelector("input[name=expires]")?.closest("label")?.textContent,
    ).toContain("Hết hạn");
    expect(window.document.body.textContent).toContain("Chưa có khóa API");
    expect(window.document.querySelector("code[data-secret]")).toBeNull();
  } finally {
    await window.close();
  }
});
