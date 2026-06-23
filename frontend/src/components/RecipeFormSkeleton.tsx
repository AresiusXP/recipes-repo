/**
 * Loading placeholder for a recipe form (edit), shown as the <Suspense>
 * fallback while the server fetches the recipe. Approximates the form layout.
 */
export function RecipeFormSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse space-y-6">
      {/* Title field */}
      <div className="space-y-2">
        <div className="h-4 w-20 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
        <div className="h-11 w-full rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70" />
      </div>
      {/* Description field */}
      <div className="space-y-2">
        <div className="h-4 w-28 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
        <div className="h-24 w-full rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70" />
      </div>
      {/* Ingredients / steps blocks */}
      <div className="space-y-2">
        <div className="h-4 w-24 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
        <div className="h-32 w-full rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70" />
      </div>
      {/* Submit button */}
      <div className="h-10 w-32 rounded-lg bg-zinc-200/70 dark:bg-zinc-800/70" />
    </div>
  );
}
