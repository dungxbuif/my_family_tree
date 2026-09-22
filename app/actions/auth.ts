"use server";

import { createSession, destroySession } from "@/utils/auth/session";
import { hashPassword, verifyPassword } from "@/utils/auth/password";
import { pool, query } from "@/utils/db/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Profile } from "@/types";
import { createUserAndProfile } from "@/utils/auth/signup";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Vui lòng nhập đầy đủ email và mật khẩu." };
  }

  try {
    const userResult = await query<{ id: string; email: string; password_hash: string }>(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email]
    );

    const user = userResult.rows[0];

    if (!user) {
      return { error: "Email hoặc mật khẩu không đúng." };
    }

    const isPasswordValid = await verifyPassword(password, user.password_hash);

    if (!isPasswordValid) {
      return { error: "Email hoặc mật khẩu không đúng." };
    }

    const profileResult = await query<Profile>(
      "SELECT is_active FROM profiles WHERE id = $1",
      [user.id]
    );

    const profile = profileResult.rows[0];

    if (!profile) {
      return { error: "Không tìm thấy thông tin hồ sơ người dùng." };
    }

    if (!profile.is_active) {
      return { error: "Tài khoản của bạn chưa được kích hoạt hoặc đã bị khóa. Vui lòng liên hệ quản trị viên." };
    }

    await createSession(user.id);
  } catch (err) {
    console.error("Login error:", err);
    return { error: "Đã có lỗi xảy ra trong quá trình đăng nhập." };
  }

  revalidatePath("/");
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  revalidatePath("/");
  redirect("/login");
}

export async function signup(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!email || !password || !confirmPassword) {
    return { error: "Vui lòng điền đầy đủ thông tin." };
  }

  if (password !== confirmPassword) {
    return { error: "Mật khẩu xác nhận không khớp." };
  }

  try {
    const passwordHash = await hashPassword(password);
    const { userId, isFirstUser } = await createUserAndProfile(pool, {
      email,
      passwordHash,
    });

    if (isFirstUser) {
      await createSession(userId);
      revalidatePath("/");
      redirect("/dashboard");
    } else {
      return { success: true, message: "Đăng ký thành công! Vui lòng chờ quản trị viên kích hoạt tài khoản của bạn." };
    }
  } catch (err) {
    if (err instanceof Error && err.message === "EMAIL_EXISTS") {
      return { error: "Email này đã được đăng ký. Vui lòng dùng email khác." };
    }
    console.error("Signup error:", err);
    return { error: "Đã có lỗi xảy ra trong quá trình đăng ký." };
  }
}
