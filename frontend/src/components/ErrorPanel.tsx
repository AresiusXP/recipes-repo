"use client";

export interface ErrorPanelProps {
  reset: () => void;
  message?: string;
}

/**
 * Shared visual content for route-level error.tsx boundaries. Kept as a
 * plain presentational component (no logging) so each error.tsx can decide
 * whether/how to log while reusing consistent styling.
 */
export function ErrorPanel({ reset, message }: ErrorPanelProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-7 w-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <div>
        <p className="text-lg font-medium text-zinc-700 dark:text-zinc-200">
          Something went wrong
        </p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {message || "Please try again. If the problem persists, come back later."}
        </p>
      </div>
      <button
        onClick={reset}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-dark"
      >
        Try again
      </button>
    </div>
  );
}
