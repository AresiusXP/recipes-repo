import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ component: "auth" });

/**
 * Lightweight, serialisable description of a configured OAuth provider.
 * Safe to pass to client components.
 */
export interface ProviderInfo {
  id: string;
  name: string;
}

/**
 * Returns the list of OAuth providers that are currently enabled based on
 * the available environment variables. Used by the login page and settings
 * to render only the providers that are actually configured.
 */
export function getConfiguredProviders(): ProviderInfo[] {
  const providers: ProviderInfo[] = [];

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push({ id: "google", name: "Google" });
  }

  if (
    process.env.MICROSOFT_ENTRA_ID_CLIENT_ID &&
    process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET
  ) {
    providers.push({ id: "microsoft-entra-id", name: "Microsoft" });
  }

  return providers;
}

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

/**
 * Build the list of enabled OAuth providers based on available env vars.
 * This allows deployments to configure only the providers they need.
 */
function buildProviders() {
  const providers = [];

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    );
  }

  if (
    process.env.MICROSOFT_ENTRA_ID_CLIENT_ID &&
    process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET
  ) {
    providers.push(
      MicrosoftEntraID({
        clientId: process.env.MICROSOFT_ENTRA_ID_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET,
        // "common" allows both personal (MSN/Outlook/Hotmail) and
        // work/school Microsoft accounts. Override via env var if needed.
        issuer:
          process.env.MICROSOFT_ENTRA_ID_ISSUER ||
          "https://login.microsoftonline.com/common/v2.0",
      })
    );
  }

  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  providers: buildProviders(),
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

      // Existing users — check ban status before allowing sign-in
      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, isBanned: true },
      });
      if (existingUser) {
        if (existingUser.isBanned) {
          log.warn({ userId: existingUser.id }, "Sign-in rejected: user is banned");
          return "/login?error=AccountBanned";
        }
        // Update lastLoginAt on successful sign-in
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { lastLoginAt: new Date() },
        });
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
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      // Defense in depth: reject sessions for banned users even if they slipped through
      if (user?.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { isBanned: true },
        });
        if (dbUser?.isBanned) {
          // Returning null signals NextAuth to invalidate the session
          return null as unknown as typeof session;
        }
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // Set lastLoginAt for brand-new users (their first sign-in creates the record)
      if (user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
      }
    },
  },
});
