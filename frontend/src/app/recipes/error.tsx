"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/ErrorPanel";

export default function RecipesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorPanel reset={reset} message="Couldn't load your recipes. Please try again." />;
}
