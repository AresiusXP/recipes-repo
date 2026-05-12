import { ImportStatusPoller } from "@/components/ImportStatusPoller";

export default async function ImportStatusPage(props: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await props.params;

  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-800/80 sm:p-10">
      <h1 className="mb-6 font-serif text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Importing Recipe
      </h1>
      <ImportStatusPoller jobId={jobId} />
    </div>
  );
}
