import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import type { Root } from "react-dom/client";
import AdminUserList from "@/components/AdminUserList";
import type { AccountMutationResult } from "@/utils/auth/account-administration";

const draft = { email: "already-used@example.test", password: "fixture-password", is_active: "false" };
const duplicate = { code: "EMAIL_IN_USE", error: "Email này đã được dùng cho một tài khoản." } as const;

let root: Root | undefined;
let browser: Window;
let restoreGlobals: (() => void) | undefined;

afterEach(async () => {
  try {
    if (root) await act(async () => root?.unmount());
    await browser?.close();
  } finally {
    root = undefined;
    restoreGlobals?.();
    restoreGlobals = undefined;
  }
});

async function renderForm(createUserAction: (state: AccountMutationResult | null, data: FormData) => Promise<AccountMutationResult>) {
  browser = new Window({ url: "http://localhost/dashboard/users" });
  const { document } = browser;
  const globals = {
    window: browser,
    document,
    Element: browser.Element,
    FormData: browser.FormData,
    location: browser.location,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const descriptors = Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  restoreGlobals = () => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  };

  const { createRoot } = await import("react-dom/client");
  const target = document.createElement("main");
  const back = document.createElement("a");
  back.href = "/dashboard/account";
  document.body.append(back, target);
  root = createRoot(target);
  await act(async () => root?.render(<AdminUserList users={[]} currentUserId="fixture-admin" createUserAction={createUserAction} />));
  target.querySelector("details")!.open = true;

  const form = target.querySelector("form")!;
  const email = form.querySelector<HTMLInputElement>('input[name="email"]')!;
  const password = form.querySelector<HTMLInputElement>('input[name="password"]')!;
  const status = form.querySelector<HTMLSelectElement>('select[name="is_active"]')!;
  const inputValue = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    inputValue.call(email, draft.email);
    email.dispatchEvent(new browser.Event("input", { bubbles: true }));
    inputValue.call(password, draft.password);
    password.dispatchEvent(new browser.Event("input", { bubbles: true }));
    status.value = draft.is_active;
    status.dispatchEvent(new browser.Event("change", { bubbles: true }));
  });
  return {
    target,
    values: () => ({ email: email.value, password: password.value, is_active: status.value }),
    submit: () => act(async () => {
      form.dispatchEvent(new browser.SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: form.querySelector("button") }));
    }),
    clickBack() {
      const click = new browser.MouseEvent("click", { bubbles: true, cancelable: true });
      back.dispatchEvent(click);
      return click.defaultPrevented;
    },
    beforeUnload() {
      const unload = new browser.Event("beforeunload", { cancelable: true });
      browser.dispatchEvent(unload);
      return unload.defaultPrevented;
    },
  };
}

test("a pending create request still prompts before an account link or browser unload", async () => {
  const request = Promise.withResolvers<AccountMutationResult>();
  const form = await renderForm(() => request.promise);
  let prompts = 0;
  browser.confirm = () => { prompts++; return false; };
  try {
    await form.submit();
    expect(form.target.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(form.clickBack()).toBe(true);
    expect(prompts).toBe(1);
    expect(form.beforeUnload()).toBe(true);
    expect(form.values()).toEqual(draft);
  } finally {
    await act(async () => request.resolve(duplicate));
  }
});

test("a duplicate account keeps all fields and prompts when leaving until success", async () => {
  const responses: AccountMutationResult[] = [duplicate, { success: true }];
  const submissions: FormData[] = [];
  const form = await renderForm(async (_state, data) => {
    submissions.push(data);
    return responses.shift()!;
  });
  browser.confirm = () => false;

  await form.submit();
  expect(form.target.querySelector('[role="alert"]')?.textContent).toBe(duplicate.error);
  expect(form.values()).toEqual(draft);
  expect(form.clickBack()).toBe(true);
  expect(form.beforeUnload()).toBe(true);
  expect(Object.fromEntries(submissions[0])).toEqual(draft);

  await form.submit();
  expect(form.target.querySelector('[role="status"]')?.textContent).toBe("Đã tạo tài khoản.");
  expect(form.values()).toEqual({ email: "", password: "", is_active: "true" });
  expect(form.beforeUnload()).toBe(false);
});

test("a failed request keeps the draft available to retry", async () => {
  const form = await renderForm(async () => {
    throw new Error("Unexpected transport failure");
  });
  await form.submit();
  expect(form.target.querySelector('[role="alert"]')?.textContent).toBe("Không thể cập nhật tài khoản. Vui lòng thử lại.");
  expect(form.values()).toEqual(draft);
  expect(form.beforeUnload()).toBe(true);
});
