export default function FavoritesLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-9 w-56 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-40 rounded-2xl border border-zinc-200/80 bg-zinc-100 dark:border-zinc-800/80 dark:bg-zinc-800/60"
          />
        ))}
      </div>
    </div>
  );
}
