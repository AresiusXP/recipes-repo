import { requireAdmin } from "@/lib/admin";
import { listAdminUsers, getAdminInfo } from "@/app/actions/admin";
import { AdminUsersTable } from "@/components/AdminUsersTable";

export const metadata = { title: "Admin — Recipes Repo" };

export default async function AdminPage() {
  const session = await requireAdmin();
  // Service versions are secondary metadata — if that request fails, the admin
  // page must still render so user management keeps working. User listing is
  // the primary function, so a failure there still surfaces as an error.
  const [users, info] = await Promise.all([
    listAdminUsers(),
    getAdminInfo().catch((err) => {
      console.error("Failed to fetch admin info:", err);
      return null;
    }),
  ]);

  const totalRecipes = users.reduce((sum, u) => sum + u.recipeCount, 0);
  const bannedCount = users.filter((u) => u.isBanned).length;
  const activeCount = users.length - bannedCount;

  const services = [
    { name: "Frontend", version: info?.versions?.frontend ?? "unknown" },
    { name: "Backend", version: info?.versions?.backend ?? "unknown" },
    { name: "Scraper", version: info?.versions?.scraper ?? "unknown" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Admin</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage users and monitor activity.
        </p>
      </div>

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

      {/* Service versions */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Service versions
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {services.map((s) => (
            <div
              key={s.name}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{s.name}</div>
              <div className="mt-1 font-mono text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {s.version}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Users table */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">Users</h2>
        <AdminUsersTable users={users} currentUserId={session.user?.id ?? ""} />
      </div>
    </div>
  );
}
