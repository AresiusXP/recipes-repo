"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { banUser, unbanUser, deleteUser, type AdminUser } from "@/app/actions/admin";

interface AdminUsersTableProps {
  users: AdminUser[];
  currentUserId: string;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function ProviderBadge({ provider }: { provider: string }) {
  const labels: Record<string, string> = {
    google: "Google",
    "microsoft-entra-id": "Microsoft",
  };
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
      {labels[provider] ?? provider}
    </span>
  );
}

export function AdminUsersTable({ users, currentUserId }: AdminUsersTableProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<string | null>(null);

  async function handleBan(userId: string) {
    setPending(userId);
    setError(null);
    setConfirmBan(null);
    const result = await banUser(userId);
    setPending(null);
    if (!result.success) {
      setError(result.error ?? "Failed to ban user.");
      return;
    }
    router.refresh();
  }

  async function handleUnban(userId: string) {
    setPending(userId);
    setError(null);
    const result = await unbanUser(userId);
    setPending(null);
    if (!result.success) {
      setError(result.error ?? "Failed to unban user.");
      return;
    }
    router.refresh();
  }

  async function handleDelete(userId: string) {
    setPending(userId);
    setError(null);
    setConfirmDelete(null);
    const result = await deleteUser(userId);
    setPending(null);
    if (!result.success) {
      setError(result.error ?? "Failed to delete user.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Confirm ban dialog */}
      {confirmBan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Ban user?
            </h2>
            <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
              The user will be immediately signed out and blocked from logging in. You can unban them at any time.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleBan(confirmBan)}
                disabled={pending === confirmBan}
                className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              >
                {pending === confirmBan ? "Banning…" : "Ban"}
              </button>
              <button
                onClick={() => setConfirmBan(null)}
                className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Delete user?
            </h2>
            <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
              This will permanently delete the user and all their data (recipes, sessions, notifications). This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={pending === confirmDelete}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {pending === confirmDelete ? "Deleting…" : "Delete"}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">User</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Recipes</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Providers</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Registered</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Last Login</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              const isLoading = pending === user.id;

              return (
                <tr key={user.id} className={user.isBanned ? "opacity-60" : ""}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {user.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.image}
                          alt={user.name ?? "User"}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                          {(user.name ?? user.email ?? "?")[0].toUpperCase()}
                        </span>
                      )}
                      <div>
                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                          {user.name ?? "—"}
                          {isSelf && (
                            <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.isBanned ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        Banned
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        Active
                      </span>
                    )}
                    {user.isBanned && user.bannedAt && (
                      <div className="mt-0.5 text-[10px] text-zinc-400">{formatDate(user.bannedAt)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                    {user.recipeCount}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.accountProviders.length > 0
                        ? user.accountProviders.map((p) => (
                            <ProviderBadge key={p} provider={p} />
                          ))
                        : <span className="text-xs text-zinc-400">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(user.lastLoginAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isSelf && (
                      <div className="flex items-center justify-end gap-2">
                        {user.isBanned ? (
                          <button
                            onClick={() => handleUnban(user.id)}
                            disabled={isLoading}
                            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            {isLoading ? "…" : "Unban"}
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmBan(user.id)}
                            disabled={isLoading}
                            className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
                          >
                            {isLoading ? "…" : "Ban"}
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDelete(user.id)}
                          disabled={isLoading}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
