/**
 * Loading placeholder for the recipe list, shown as the <Suspense> fallback
 * while the server fetches recipes. Approximates the grid layout to minimize
 * layout shift when the real list streams in.
 */
export function RecipeListSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      {/* Search/filter bar placeholder */}
      <div className="mb-6 h-11 w-full rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70" />

      {/* Grid of card placeholders */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/80 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-800/60"
          >
            <div className="aspect-video w-full bg-zinc-200/70 dark:bg-zinc-800/70" />
            <div className="space-y-3 p-4">
              <div className="h-5 w-3/4 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
              <div className="h-4 w-full rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
              <div className="h-4 w-2/3 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
