import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Require an authenticated session. Redirects to /login if not authenticated.
 * Returns the session with a guaranteed user.
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session as typeof session & { user: { id: string; name?: string | null; email?: string | null; image?: string | null } };
}
