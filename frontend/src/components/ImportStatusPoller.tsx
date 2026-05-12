"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ImportJobStatus {
  id: string;
  status: "pending" | "scraping" | "extracting" | "done" | "failed";
  recipeId: string | null;
  error: string | null;
  updatedAt: string;
}

interface ImportStatusPollerProps {
  jobId: string;
  onRetry?: () => void;
}

const STATUS_MESSAGES: Record<ImportJobStatus["status"], string> = {
  pending: "Queued…",
  scraping: "Fetching page…",
  extracting: "Extracting recipe with AI…",
  done: "Done!",
  failed: "Import failed",
};

const POLL_INTERVAL_MS = 2500;

export function ImportStatusPoller({ jobId, onRetry }: ImportStatusPollerProps) {
  const router = useRouter();
  const [status, setStatus] = useState<ImportJobStatus["status"]>("pending");
  const [error, setError] = useState<string | null>(null);
  const [dots, setDots] = useState("");

  // Animated dots for in-progress states
  useEffect(() => {
    if (status === "done" || status === "failed") return;
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 500);
    return () => clearInterval(interval);
  }, [status]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/import-status/${jobId}`);
      if (!res.ok) return;
      const data: ImportJobStatus = await res.json();
      setStatus(data.status);
      if (data.error) setError(data.error);
      if (data.status === "done" && data.recipeId) {
        router.push(`/recipes/${data.recipeId}`);
      }
    } catch {
      // Network error — keep polling
    }
  }, [jobId, router]);

  useEffect(() => {
    if (status === "done" || status === "failed") return;

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [poll, status]);

  // Trigger an immediate first poll on mount
  useEffect(() => {
    void poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isInProgress = status !== "done" && status !== "failed";

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      {/* Progress indicator */}
      {isInProgress && (
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {STATUS_MESSAGES[status]}{dots}
          </span>
        </div>
      )}

      {/* Step indicators */}
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {(["pending", "scraping", "extracting", "done"] as const).map((step) => {
          const stepIndex = ["pending", "scraping", "extracting", "done"].indexOf(step);
          const currentIndex = ["pending", "scraping", "extracting", "done"].indexOf(
            status === "failed" ? "pending" : status
          );
          const isDone = stepIndex < currentIndex || status === "done";
          const isCurrent = stepIndex === currentIndex && status !== "done" && status !== "failed";

          return (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`h-4 w-4 rounded-full flex-shrink-0 transition-colors ${
                  isDone
                    ? "bg-green-500"
                    : isCurrent
                    ? "bg-primary animate-pulse"
                    : "bg-zinc-200 dark:bg-zinc-700"
                }`}
              />
              <span
                className={`text-sm ${
                  isDone || isCurrent
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-400 dark:text-zinc-600"
                }`}
              >
                {STATUS_MESSAGES[step]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Error state */}
      {status === "failed" && (
        <div className="flex flex-col items-center gap-3 mt-2">
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400 max-w-sm text-center">
            {error || "Import failed. Please try again."}
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-sm text-primary hover:underline"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
