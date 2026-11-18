"use server";

import {
  createSystemUser,
  deleteSystemUser,
  setSystemUserActive,
  type AccountMutationResult,
} from "@/utils/auth/account-administration";
import { getSessionToken } from "@/utils/auth/session";
import { revalidatePath } from "next/cache";

function refreshAccountList(result: AccountMutationResult) {
  if ("success" in result) revalidatePath("/dashboard/users");
  return result;
}

export async function adminCreateUser(formData: FormData) {
  return refreshAccountList(await createSystemUser(await getSessionToken(), formData));
}

export async function toggleUserStatus(userId: string, active: boolean) {
  return refreshAccountList(await setSystemUserActive(await getSessionToken(), userId, active));
}

export async function deleteUser(userId: string) {
  return refreshAccountList(await deleteSystemUser(await getSessionToken(), userId));
}
