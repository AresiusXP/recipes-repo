export default function RecipesLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-9 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-10 w-full rounded-lg bg-zinc-200 dark:bg-zinc-800 sm:w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-40 rounded-2xl border border-zinc-200/80 bg-zinc-100 dark:border-zinc-800/80 dark:bg-zinc-800/60"
          />
        ))}
      </div>
    </div>
  );
}
