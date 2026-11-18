"use server";

import { createSession, destroySession } from "@/utils/auth/session";
import { verifyPassword } from "@/utils/auth/password";
import { query } from "@/utils/db/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type LoginError = { error: string; email: string };

export async function login(_previous: LoginError | null, formData: FormData): Promise<LoginError> {
  const submittedEmail = formData.get("email");
  const email = typeof submittedEmail === "string" ? submittedEmail : "";
  const password = formData.get("password");

  if (!email || typeof password !== "string" || !password) {
    return { error: "Vui lòng nhập đầy đủ email và mật khẩu.", email };
  }

  try {
    const { rows: [user] } = await query<{ id: string; password_hash: string; is_active: boolean }>(
      `SELECT u.id, u.password_hash, p.is_active
         FROM users u JOIN profiles p ON p.id = u.id
        WHERE public.normalize_email(u.email) = public.normalize_email($1)`,
      [email],
    );

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return { error: "Email hoặc mật khẩu không đúng.", email };
    }

    if (!user.is_active || !(await createSession(user.id))) {
      return { error: "Tài khoản của bạn chưa được kích hoạt hoặc đã bị khóa. Vui lòng liên hệ Quản trị viên hệ thống.", email };
    }
  } catch (err) {
    console.error("Login error:", err);
    return { error: "Đã có lỗi xảy ra trong quá trình đăng nhập.", email };
  }

  revalidatePath("/");
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  revalidatePath("/");
  redirect("/login");
}
