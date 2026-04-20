"use client";

import { signIn } from "next-auth/react";

export function MicrosoftSignInButton() {
  return (
    <button
      type="button"
      onClick={() => signIn("microsoft-entra-id", { callbackUrl: "/recipes" })}
      className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
    >
      {/* Microsoft logo (official "four squares" mark) */}
      <svg className="h-5 w-5" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
      Sign in with Microsoft
    </button>
  );
}
