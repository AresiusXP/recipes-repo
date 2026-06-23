import { Suspense } from "react";
import { requireAdmin } from "@/lib/admin";
import { listAdminUsers } from "@/app/actions/admin";
import { AdminUsersTable } from "@/components/AdminUsersTable";

export const metadata = { title: "Admin — Recipes Repo" };

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Admin</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage users and monitor activity.
        </p>
      </div>
      <Suspense fallback={<AdminContentSkeleton />}>
        <AdminContent />
      </Suspense>
    </div>
  );
}

async function AdminContent() {
  const session = await requireAdmin();
  const users = await listAdminUsers();

  const totalRecipes = users.reduce((sum, u) => sum + u.recipeCount, 0);
  const bannedCount = users.filter((u) => u.isBanned).length;
  const activeCount = users.length - bannedCount;

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{users.length}</div>
          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Total users</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{activeCount}</div>
          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Active</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{bannedCount}</div>
          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Banned</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{totalRecipes}</div>
          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Total recipes</div>
        </div>
      </div>

      {/* Users table */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">Users</h2>
        <AdminUsersTable users={users} currentUserId={session.user?.id ?? ""} />
      </div>
    </>
  );
}

function AdminContentSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
          />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70" />
    </div>
  );
}
