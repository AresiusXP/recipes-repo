export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-9 w-40 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </div>
      <div className="h-64 w-full rounded-xl bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
