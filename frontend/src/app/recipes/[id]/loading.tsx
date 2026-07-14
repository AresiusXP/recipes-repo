export default function RecipeDetailLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-9 w-64 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 w-9 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
      </div>
      <div className="mb-8 h-64 w-full rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-4 w-full max-w-md rounded bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </div>
    </div>
  );
}
