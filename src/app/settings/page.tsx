import { requireAuth } from "@/lib/require-auth";
import { getUserSettings } from "@/app/actions/user";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsPage() {
  await requireAuth();
  const settings = await getUserSettings();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 font-serif text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Settings
      </h1>
      <SettingsForm initialSettings={settings} />
    </div>
  );
}
