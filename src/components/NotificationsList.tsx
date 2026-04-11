"use client";

import { useState } from "react";
import Link from "next/link";
import { markNotificationRead, markAllNotificationsRead, type NotificationItem } from "@/app/actions/notifications";

interface NotificationsListProps {
  initialNotifications: NotificationItem[];
}

export function NotificationsList({ initialNotifications }: NotificationsListProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [markingAll, setMarkingAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function handleMarkRead(notificationId: string) {
    // Optimistic update
    const prev = notifications;
    setNotifications((curr) =>
      curr.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
    );
    setErrorMessage(null);
    const result = await markNotificationRead(notificationId);
    if (!result.success) {
      // Roll back on failure
      setNotifications(prev);
      setErrorMessage(result.error ?? "Failed to mark as read.");
    }
  }

  async function handleMarkAllRead() {
    const prev = notifications;
    setMarkingAll(true);
    setNotifications((curr) => curr.map((n) => ({ ...n, isRead: true })));
    setErrorMessage(null);
    const result = await markAllNotificationsRead();
    if (!result.success) {
      setNotifications(prev);
      setErrorMessage(result.error ?? "Failed to mark all as read.");
    }
    setMarkingAll(false);
  }

  if (notifications.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <p className="text-lg font-medium text-zinc-500 dark:text-zinc-400">No notifications yet</p>
        <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
          When someone shares a recipe with you, it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Error banner */}
      {errorMessage && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {errorMessage}
        </div>
      )}

      {/* Header controls */}
      {unreadCount > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
          </p>
          <button
            type="button"
            disabled={markingAll}
            onClick={handleMarkAllRead}
            className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
          >
            Mark all as read
          </button>
        </div>
      )}

      <ul className="space-y-3">
        {notifications.map((notification) => {
          const senderName = notification.sender?.name ?? "Someone";
          const timeAgo = formatTimeAgo(notification.createdAt);

          return (
            <li
              key={notification.id}
              className={`rounded-xl border p-4 transition-colors ${
                notification.isRead
                  ? "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  : "border-primary/30 bg-primary/5 dark:border-primary/20 dark:bg-primary/5"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Sender avatar */}
                <div className="mt-0.5 shrink-0">
                  {notification.sender?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={notification.sender.image}
                      alt={senderName}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                      {senderName[0]?.toUpperCase() ?? "?"}
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${notification.isRead ? "text-zinc-700 dark:text-zinc-300" : "font-medium text-zinc-900 dark:text-zinc-50"}`}>
                      {notification.message}
                    </p>
                    {!notification.isRead && (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{timeAgo}</p>

                  {/* Actions */}
                  <div className="mt-2 flex items-center gap-3">
                    {notification.recipeId && (
                      <Link
                        href={`/recipes/${notification.recipeId}`}
                        onClick={() => {
                          if (!notification.isRead) handleMarkRead(notification.id);
                        }}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        View recipe →
                      </Link>
                    )}
                    {!notification.isRead && (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(notification.id)}
                        className="text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}
