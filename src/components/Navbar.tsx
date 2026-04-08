import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

export async function Navbar() {
  const session = await auth();

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <Link
          href="/recipes"
          className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          <span className="text-xl">🍳</span>
          <span className="hidden sm:inline">Recipes Repo</span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/recipes/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-dark"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="hidden sm:inline">Add Recipe</span>
          </Link>

          {session?.user && (
            <div className="flex items-center gap-2">
              {session.user.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  className="h-7 w-7 rounded-full"
                />
              )}
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <button
                  type="submit"
                  className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
