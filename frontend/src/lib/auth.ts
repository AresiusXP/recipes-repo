import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import pino from "pino";

const log = pino({ name: "auth" });

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

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
 * the available environment variables.
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

function buildProviders() {
  const providers = [];

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // NextAuth v5 / oauth4webapi enforces RFC 9207 iss parameter validation
        // because Google's OIDC discovery sets authorization_response_iss_parameter_supported=true,
        // but Google does not reliably include iss in the callback URL.
        // Using checks: ["pkce"] skips the iss check while keeping PKCE security.
        checks: ["pkce"],
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
        issuer:
          process.env.MICROSOFT_ENTRA_ID_ISSUER ||
          "https://login.microsoftonline.com/common/v2.0",
      })
    );
  }

  return providers;
}

/**
 * Notify the backend of a sign-in event.
 * The backend handles: ban checks, lastLoginAt updates, allowlist enforcement.
 * Returns { allowed: boolean, userId?: string, reason?: string }
 */
async function notifyBackendSignIn(
  email: string,
  name: string | null | undefined,
  image: string | null | undefined,
  provider?: string,
  providerAccountId?: string
): Promise<{ allowed: boolean; userId?: string; reason?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/signin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.BACKEND_INTERNAL_SECRET
          ? { "X-Internal-Secret": process.env.BACKEND_INTERNAL_SECRET }
          : {}),
      },
      body: JSON.stringify({ email, name, image, provider, providerAccountId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { allowed: false, reason: data.reason || "sign-in rejected by backend" };
    }
    const data = await res.json().catch(() => ({}));
    return { allowed: true, userId: data.userId as string | undefined };
  } catch (err) {
    log.error({ err }, "Failed to notify backend of sign-in");
    // Fail open: allow sign-in if backend is unreachable (avoids lockout during deploys)
    return { allowed: true };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // JWT strategy — no database adapter in the frontend.
  // The backend owns the database; the frontend only manages the session cookie.
  session: { strategy: "jwt" },
  providers: buildProviders(),
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      const email = user.email?.toLowerCase();
      if (!email) {
        log.warn("Sign-in rejected: no email provided by provider");
        return false;
      }

      // Check local allowlist first (fast, no backend call needed)
      const allowedEmails = getAllowedEmails();
      if (allowedEmails && !allowedEmails.has(email)) {
        log.warn("Sign-in rejected: email not on allowlist");
        return "/login?error=RegistrationNotAllowed";
      }

      // Notify backend (ban check, lastLoginAt, user creation, provider linkage)
      const result = await notifyBackendSignIn(
        email,
        user.name,
        user.image,
        account?.provider,
        account?.providerAccountId ?? undefined
      );
      if (!result.allowed) {
        if (result.reason?.includes("banned")) {
          return "/login?error=AccountBanned";
        }
        return "/login?error=RegistrationNotAllowed";
      }

      // Attach the backend UUID directly to the user object so the jwt callback
      // can embed it in the token. This avoids any in-memory state and works
      // correctly across multiple pods.
      if (result.userId) {
        (user as Record<string, unknown>).backendId = result.userId;
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;

        // Use the backend UUID as the token subject so the Go backend can
        // identify the user by their DB UUID rather than the OAuth provider ID.
        const backendId = (user as Record<string, unknown>).backendId;
        if (typeof backendId === "string" && backendId) {
          token.sub = backendId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // Prefer the backend UUID (token.sub) as the canonical user ID.
        // token.id holds the OAuth provider ID; token.sub is set to the backend UUID on sign-in.
        session.user.id = (token.sub || token.id) as string;
      }
      return session;
    },
  },
});
