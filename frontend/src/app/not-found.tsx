import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-full w-full flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center" id="main-content">
      <p className="font-serif text-5xl font-bold text-primary">404</p>
      <p className="text-lg font-medium text-zinc-700 dark:text-zinc-200">
        We couldn&apos;t find that page
      </p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        It may have been removed, or the link might be incorrect.
      </p>
      <Link
        href="/recipes"
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-dark"
      >
        Back to Recipes
      </Link>
    </div>
  );
}
