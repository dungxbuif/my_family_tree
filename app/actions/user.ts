"use server";

import { UserRole } from "@/types";
import { revalidatePath } from "next/cache";
import { getDataClient } from "@/utils/data/queries";
import { hashPassword } from "@/utils/auth/password";

export async function changeUserRole(userId: string, newRole: UserRole) {
  const db = getDataClient();
  const { error } = await db.from("profiles")
    .update({ role: newRole })
    .eq("id", userId);

  if (error) {
    console.error("Failed to change user role:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/users");
  return { success: true };
}

export async function deleteUser(userId: string) {
  const db = getDataClient();
  // Profiles table has ON DELETE CASCADE from users in the schema
  const { error } = await db.from("users")
    .delete()
    .eq("id", userId);

  if (error) {
    console.error("Failed to delete user:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/users");
  return { success: true };
}

export async function adminCreateUser(formData: FormData) {
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const role = (formData.get("role")?.toString() as UserRole) || "member";

  if (role !== "admin" && role !== "editor" && role !== "member") {
    return { error: "Vai trò không hợp lệ." };
  }

  const isActiveStr = formData.get("is_active")?.toString();
  const isActive = isActiveStr === "false" ? false : true;

  if (!email || !password) {
    return { error: "Email và mật khẩu là bắt buộc." };
  }

  try {
    const db = getDataClient();
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    // 1. Insert into users
    const userResult = await db.from("users").insert({
      id: userId,
      email,
      password_hash: passwordHash,
    });

    if (userResult.error) throw new Error(userResult.error.message);

    // 2. Insert into profiles
    const profileResult = await db.from("profiles").insert({
      id: userId,
      role,
      is_active: isActive,
    });

    if (profileResult.error) throw new Error(profileResult.error.message);

    revalidatePath("/dashboard/users");
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to create user:", error);
    return { error: message };
  }
}

export async function toggleUserStatus(userId: string, newStatus: boolean) {
  const db = getDataClient();
  const { error } = await db.from("profiles")
    .update({ is_active: newStatus })
    .eq("id", userId);

  if (error) {
    console.error("Failed to change user status:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/users");
  return { success: true };
}
