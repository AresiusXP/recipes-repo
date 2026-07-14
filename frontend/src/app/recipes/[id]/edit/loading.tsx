export default function RecipeEditLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-9 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-48 w-full rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 w-full rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </div>
    </div>
  );
}
