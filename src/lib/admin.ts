import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { redirect } from "next/navigation";

const log = logger.child({ component: "admin" });

const DEFAULT_ADMIN_EMAIL = "aresiusxp@gmail.com";

// Parse once at module load time to avoid repeated string splitting on every request.
let _adminEmails: Set<string> | null = null;

/**
 * Parse the ADMIN_EMAILS env var into a Set of lowercase emails.
 * Falls back to the default admin email when the variable is unset or empty.
 * Result is memoized for the lifetime of the process.
 */
export function getAdminEmails(): Set<string> {
  if (_adminEmails !== null) return _adminEmails;
  const raw = process.env.ADMIN_EMAILS?.trim();
  if (!raw) {
    _adminEmails = new Set([DEFAULT_ADMIN_EMAIL]);
  } else {
    _adminEmails = new Set(
      raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
    );
  }
  return _adminEmails;
}

/**
 * Returns true if the given email belongs to an admin.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().has(email.toLowerCase());
}

/**
 * Require an authenticated admin session.
 * Redirects to /recipes if the user is not an admin.
 * Returns the session with a guaranteed user.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    log.warn("Unauthenticated request to admin area — redirecting to /login");
    redirect("/login");
  }
  if (!isAdminEmail(session.user.email)) {
    log.warn({ userId: session.user.id }, "Non-admin request to admin area — redirecting to /recipes");
    redirect("/recipes");
  }
  return session as typeof session & {
    user: { id: string; name?: string | null; email: string; image?: string | null };
  };
}
