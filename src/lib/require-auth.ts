import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { redirect } from "next/navigation";

const log = logger.child({ component: "require-auth" });

/**
 * Require an authenticated session. Redirects to /login if not authenticated.
 * Returns the session with a guaranteed user.
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    log.warn("Unauthenticated request detected — redirecting to /login");
    redirect("/login");
  }
  return session as typeof session & { user: { id: string; name?: string | null; email?: string | null; image?: string | null } };
}
