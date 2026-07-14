"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/ErrorPanel";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-4xl flex-1 items-center justify-center px-4 py-10" id="main-content">
      <ErrorPanel reset={reset} />
    </div>
  );
}
