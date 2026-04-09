"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { translateRecipe } from "@/app/actions/recipes";

interface TranslateRecipeButtonProps {
  recipeId: string;
}

export function TranslateRecipeButton({ recipeId }: TranslateRecipeButtonProps) {
  const router = useRouter();
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTranslate() {
    setTranslating(true);
    setError(null);

    try {
      const result = await translateRecipe(recipeId);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to translate recipe");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleTranslate}
        disabled={translating}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {translating ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Translating...
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M9 2.25a.75.75 0 0 1 .75.75v1.506a49.384 49.384 0 0 1 5.343.371.75.75 0 1 1-.186 1.489c-.66-.083-1.323-.151-1.99-.206l-1.72 4.3a12.07 12.07 0 0 0 5.023 1.054.75.75 0 0 1 0 1.5 13.571 13.571 0 0 1-6.146-1.455l-.9 2.25c1.083.399 2.14.858 3.165 1.38a.75.75 0 1 1-.68 1.337 26.518 26.518 0 0 0-3.275-1.424l-.142.355a.75.75 0 1 1-1.392-.557l.222-.555A27.076 27.076 0 0 0 3.75 15a.75.75 0 0 1 0-1.5c1.08 0 2.145.073 3.192.216l.896-2.241a13.476 13.476 0 0 1-3.122-.798.75.75 0 0 1 .482-1.42 11.975 11.975 0 0 0 3.56.752l1.72-4.299A49.178 49.178 0 0 0 6.75 4.506V6a.75.75 0 0 1-1.5 0V3A.75.75 0 0 1 6 2.25h3Z"
                clipRule="evenodd"
              />
              <path d="M21.687 16.5h-3.375l-.75-1.5h4.875l-.75 1.5ZM19.5 12l2.953 6H22.5a.75.75 0 0 1 0 1.5h-3.375a.75.75 0 0 1-.69-.458l-3.248-6.75a.75.75 0 0 1 1.36-.636L19.5 12ZM16.5 18h-.375a.75.75 0 0 1 0-1.5h.375V18Z" />
            </svg>
            Translate to English
          </>
        )}
      </button>
      {error && (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
