import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { handleSignOut } from "@/app/actions/auth";
import { UserMenu } from "@/components/UserMenu";
import { getUnreadNotificationCount } from "@/app/actions/notifications";
import { isAdminEmail } from "@/lib/admin";

export async function Navbar() {
  const session = await auth();

  let unreadCount = 0;
  if (session?.user?.id) {
    try {
      unreadCount = await getUnreadNotificationCount();
    } catch {
      // non-critical — degrade silently
    }
  }

  const isAdmin = isAdminEmail(session?.user?.email);

  return (
    <nav className="sticky top-4 z-50 mx-auto mt-4 w-[calc(100%-2rem)] max-w-4xl transform-gpu rounded-2xl border border-zinc-200/50 bg-white/70 shadow-sm backdrop-blur-md dark:border-zinc-800/50 dark:bg-zinc-800/50">
      <div className="flex h-14 items-center justify-between px-4">
        <Link
          href="/recipes"
          className="flex items-center gap-2 font-serif text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
            <Image src="/favicon.ico" alt="Recipes" width={24} height={24} className="h-6 w-6" />
          <span className="hidden sm:inline">Recipes Repo</span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/recipes/favorites"
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4 text-amber-500"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z"
                clipRule="evenodd"
              />
            </svg>
            <span className="hidden sm:inline">Favorites</span>
          </Link>

          {/* Notifications bell */}
          {session?.user && (
            <Link
              href="/notifications"
              aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
              className="relative inline-flex items-center justify-center rounded-lg border border-zinc-200 p-1.5 text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.25 9a6.75 6.75 0 0 1 13.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 0 1-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 1 1-7.48 0 24.585 24.585 0 0 1-4.831-1.244.75.75 0 0 1-.298-1.205A8.217 8.217 0 0 0 5.25 9.75V9Zm4.502 8.9a2.25 2.25 0 1 0 4.496 0 25.057 25.057 0 0 1-4.496 0Z"
                  clipRule="evenodd"
                />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          )}

          <Link
            href="/recipes/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-dark"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
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
            <UserMenu
              userName={session.user.name}
              userImage={session.user.image}
              signOutAction={handleSignOut}
              isAdmin={isAdmin}
            />
          )}
        </div>
      </div>
    </nav>
  );
}
