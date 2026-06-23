import { Suspense } from "react";
import { requireAuth } from "@/lib/require-auth";
import { getUserSettings, getLinkedAccounts } from "@/app/actions/user";
import { getConfiguredProviders } from "@/lib/auth";
import { SettingsForm } from "@/components/SettingsForm";

interface SettingsPageProps {
  searchParams: Promise<{ linked?: string; error?: string }>;
}

export default function SettingsPage({ searchParams }: SettingsPageProps) {
  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-800/80 sm:p-10">
      <h1 className="mb-6 font-serif text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Settings
      </h1>
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SettingsContent({ searchParams }: SettingsPageProps) {
  await requireAuth();
  const [settings, linkedAccounts, params] = await Promise.all([
    getUserSettings(),
    getLinkedAccounts(),
    searchParams,
  ]);
  const configuredProviders = getConfiguredProviders();

  return (
    <SettingsForm
      initialSettings={settings}
      linkedAccounts={linkedAccounts}
      configuredProviders={configuredProviders}
      linkedParam={params.linked}
      errorParam={params.error}
    />
  );
}

function SettingsSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-1/3 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
          <div className="h-10 w-full rounded-lg bg-zinc-200/70 dark:bg-zinc-800/70" />
        </div>
      ))}
    </div>
  );
}
