import { requireAuth } from "@/lib/require-auth";
import { getUserSettings } from "@/app/actions/user";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsPage() {
  await requireAuth();
  const settings = await getUserSettings();

  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-800/80 sm:p-10">
      <h1 className="mb-6 font-serif text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Settings
      </h1>
      <SettingsForm initialSettings={settings} />
    </div>
  );
}
