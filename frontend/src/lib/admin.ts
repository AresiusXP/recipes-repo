/**
 * Admin auth guard for the frontend.
 * Checks that the current user is an admin (email in ADMIN_EMAILS env var).
 * Redirects to /recipes if not an admin.
 */

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "aresiusxp@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!session.user.email || !ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
    redirect("/recipes");
  }
  return session;
}

/**
 * Check if an email is an admin email.
 * Used by the Navbar to show admin links.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
