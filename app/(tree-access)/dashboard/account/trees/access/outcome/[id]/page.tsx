import { getSessionToken } from "@/utils/auth/session";
import { readNativeAccessOutcome } from "@/utils/auth/native-access-submission";
import NativeAccessResult from "@/components/NativeAccessResult";

export default async function AccessOutcomePage({ params }: { params: Promise<{ id: string }> }) {
  const token = await getSessionToken();
  const { id } = await params;
  const outcome = token && await readNativeAccessOutcome(token, id);
  if (!outcome) return <p role="alert">Không có kết quả trong phiên đăng nhập này.</p>;
  return <NativeAccessResult outcome={outcome} />;
}
