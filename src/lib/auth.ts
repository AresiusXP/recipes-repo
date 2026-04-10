import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ component: "auth" });

/**
 * Parse the ALLOWED_EMAILS env var into a Set of lowercase emails.
 * Returns null when the variable is unset or empty (open registration).
 */
function getAllowedEmails(): Set<string> | null {
  const raw = process.env.ALLOWED_EMAILS?.trim();
  if (!raw) return null;
  return new Set(
    raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) {
        log.warn("Sign-in rejected: no email provided by provider");
        return false;
      }

      // Existing users can always sign in
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existingUser) {
        log.info({ userId: existingUser.id }, "Existing user signed in");
        return true;
      }

      // New user — check the allowlist
      const allowedEmails = getAllowedEmails();

      // No allowlist configured → open registration
      if (!allowedEmails) {
        log.info("New user registered (open registration — no allowlist configured)");
        return true;
      }

      // Email is on the allowlist → allow registration
      if (allowedEmails.has(email)) {
        log.info("New user registered (email matched allowlist)");
        return true;
      }

      // Blocked — redirect to login with an error
      log.warn("Sign-in rejected: email not on allowlist");
      return "/login?error=RegistrationNotAllowed";
    },
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
