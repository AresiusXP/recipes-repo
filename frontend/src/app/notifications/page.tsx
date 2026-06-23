import { Suspense } from "react";
import { requireAuth } from "@/lib/require-auth";
import { getNotifications } from "@/app/actions/notifications";
import { NotificationsList } from "@/components/NotificationsList";

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 font-serif text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Notifications
      </h1>
      <Suspense fallback={<NotificationsSkeleton />}>
        <NotificationsContent />
      </Suspense>
    </div>
  );
}

async function NotificationsContent() {
  await requireAuth();
  const notifications = await getNotifications();
  return <NotificationsList initialNotifications={notifications} />;
}

function NotificationsSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-20 rounded-2xl border border-zinc-200/80 bg-white/80 dark:border-zinc-800/80 dark:bg-zinc-800/60"
        />
      ))}
    </div>
  );
}
