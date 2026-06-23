import { auth, getConfiguredProviders } from "@/lib/auth";
import { redirect } from "next/navigation";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { MicrosoftSignInButton } from "@/components/MicrosoftSignInButton";

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  if (session?.user) {
    redirect("/recipes");
  }

  const { error } = await searchParams;
  const isRegistrationBlocked = error === "RegistrationNotAllowed";
  const isAccountLinkError = error === "OAuthAccountNotLinked";
  const isAccountBanned = error === "AccountBanned";

  const configuredProviders = getConfiguredProviders();
  const isGoogleEnabled = configuredProviders.some((p) => p.id === "google");
  const isMicrosoftEnabled = configuredProviders.some((p) => p.id === "microsoft-entra-id");
  const hasAnyProvider = configuredProviders.length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-amber-50 to-background dark:from-zinc-900 dark:to-background px-4">
      <div className="w-full max-w-sm rounded-3xl border border-zinc-200/80 bg-white/90 p-8 shadow-xl backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-800/80">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            🍳 Recipes Repo
          </h1>
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Sign in to manage your recipe collection
          </p>
        </div>

        {isAccountBanned && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <p className="font-medium">Account banned</p>
            <p className="mt-1">
              Your account has been banned and you are no longer able to sign in.
              Please contact the administrator if you believe this is a mistake.
            </p>
          </div>
        )}

        {isRegistrationBlocked && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <p className="font-medium">Registration restricted</p>
            <p className="mt-1">
              Your email address is not on the approved list. Please contact the administrator if you believe this is a mistake.
            </p>
          </div>
        )}

        {isAccountLinkError && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <p className="font-medium">Account already exists</p>
            <p className="mt-1">
              An account with this email address already exists under a different
              sign-in provider. Sign in with the provider you originally used,
              then go to{" "}
              <span className="font-medium">Settings → Linked Accounts</span> to
              connect your other account.
            </p>
          </div>
        )}

        {hasAnyProvider ? (
          <div className="flex flex-col gap-3">
            {isGoogleEnabled && <GoogleSignInButton />}
            {isMicrosoftEnabled && <MicrosoftSignInButton />}
          </div>
        ) : (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            No sign-in providers are configured. Please contact the administrator.
          </p>
        )}
      </div>
    </div>
  );
}
