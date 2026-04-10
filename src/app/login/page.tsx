import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-amber-50 to-background dark:from-zinc-900 dark:to-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            🍳 Recipes Repo
          </h1>
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            Sign in to manage your recipe collection
          </p>
        </div>

        {isRegistrationBlocked && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            Registration is currently restricted. Your email address is not on the approved list. Please contact the administrator if you believe this is a mistake.
          </div>
        )}

        <GoogleSignInButton />
      </div>
    </div>
  );
}
