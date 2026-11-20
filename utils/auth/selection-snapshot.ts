import type { AccessibleTree } from "./tree-access";

export type SelectionSnapshot = {
  trees: AccessibleTree[];
  currentId?: string;
  revision: string;
};
export const selectionUrl = "/dashboard/account/trees/selection";

export async function readSelection(): Promise<SelectionSnapshot> {
  const response = await fetch(selectionUrl, {
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error("Selection unavailable");
  return response.json();
}
