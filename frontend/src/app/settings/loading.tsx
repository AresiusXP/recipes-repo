export default function SettingsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-9 w-40 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-24 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 w-full rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </div>
    </div>
  );
}
