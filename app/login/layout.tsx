import { getProfile } from "@/utils/auth/session";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function LoginLayout({ children }: { children: ReactNode }) {
  if ((await getProfile())?.is_active) redirect("/dashboard");
  return children;
}
