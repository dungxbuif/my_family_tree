import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUser } from "@/utils/auth/session";
import { getBrowserTreeSelection } from "@/utils/auth/browser-tree-selection";
import { familyPeople } from "./people";
import { FamilyDataError, forbidden } from "./records";

async function selected() {
  const user = await getUser();
  if (!user) return null;
  const { current } = await getBrowserTreeSelection(user.id);
  return (
    current && { tree: current, people: familyPeople(user.id, current.id) }
  );
}
export async function currentFamilyPage() {
  const current = await selected();
  if (!current) redirect("/dashboard/account/trees");
  return current;
}
export async function currentPeople(expected: unknown) {
  const current = await selected();
  if (!current || expected !== current.tree.id) throw forbidden();
  return current.people;
}
export function changePeople<T extends object>(operation: () => Promise<T>) {
  return changeFamily("/dashboard/members", operation);
}
export async function changeFamily<T extends object>(
  path: string,
  operation: () => Promise<T>,
): Promise<
  | ({ success: true; error?: undefined } & T)
  | { error: string; success?: undefined }
> {
  try {
    const result = await operation();
    revalidatePath(path, "layout");
    if (path === "/dashboard/members") revalidatePath("/dashboard/lineage");
    revalidatePath("/dashboard");
    return { success: true, ...result };
  } catch (err) {
    return {
      error:
        err instanceof FamilyDataError
          ? err.message
          : "Không thể lưu thay đổi. Vui lòng kiểm tra lại.",
    };
  }
}
