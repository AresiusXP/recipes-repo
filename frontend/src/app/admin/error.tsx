"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/ErrorPanel";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorPanel reset={reset} message="Couldn't load the admin dashboard. Please try again." />;
}
