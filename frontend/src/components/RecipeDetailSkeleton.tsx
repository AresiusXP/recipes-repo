/**
 * Loading placeholder for the recipe detail page, shown as the <Suspense>
 * fallback while the server fetches the recipe.
 */
export function RecipeDetailSkeleton() {
  return (
    <article
      aria-hidden="true"
      className="mx-auto max-w-3xl animate-pulse overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-800/80 sm:p-10"
    >
      {/* Title + actions */}
      <div className="mb-8">
        <div className="h-9 w-2/3 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-20 rounded-lg bg-zinc-200/70 dark:bg-zinc-800/70" />
          ))}
        </div>
        <div className="mt-4 h-4 w-full rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
      </div>

      {/* Image */}
      <div className="mb-10 aspect-video w-full rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/70" />

      {/* Ingredients */}
      <div className="mb-12 rounded-2xl bg-zinc-50/50 p-6 dark:bg-zinc-800/20 sm:p-8">
        <div className="mb-6 h-7 w-40 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-5 w-full rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
          ))}
        </div>
      </div>

      {/* Steps */}
      <div>
        <div className="mb-6 h-7 w-40 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
        <div className="space-y-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 w-full rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
          ))}
        </div>
      </div>
    </article>
  );
}
