import { redirect } from "next/navigation";
import AgentCredentials from "@/components/AgentCredentials";
import { ownCredentials } from "@/utils/agent/credentials";
import { getSessionUser } from "@/utils/auth/session";

export default async function ApiKeysPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.is_active) redirect("/dashboard");
  const keys = await ownCredentials(user.id).list();
  return (
    <main className="content-gutter mx-auto w-full max-w-xl flex-1 space-y-4 py-6">
      <a
        className="inline-flex min-h-11 items-center text-primary underline"
        href="/dashboard/account"
      >
        Tài khoản
      </a>
      <h1 className="text-[26px] font-bold text-primary">Khóa API</h1>
      <p className="break-all text-secondary">{user.email}</p>
      <AgentCredentials initial={keys} />
    </main>
  );
}
