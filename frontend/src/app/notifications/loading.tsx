export default function NotificationsLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-9 w-56 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 w-full rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      ))}
    </div>
  );
}
