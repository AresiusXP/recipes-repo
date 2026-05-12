import { requireAuth } from "@/lib/require-auth";
import { getNotifications } from "@/app/actions/notifications";
import { NotificationsList } from "@/components/NotificationsList";

export default async function NotificationsPage() {
  await requireAuth();
  const notifications = await getNotifications();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 font-serif text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Notifications
      </h1>
      <NotificationsList initialNotifications={notifications} />
    </div>
  );
}
