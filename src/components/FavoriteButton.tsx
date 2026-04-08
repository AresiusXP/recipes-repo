"use client";

import { useState, useTransition } from "react";
import { toggleFavorite } from "@/app/actions/recipes";

interface FavoriteButtonProps {
  recipeId: string;
  initialFavorite: boolean;
  /** Compact mode for recipe cards (smaller icon, no text) */
  compact?: boolean;
  onToggled?: (isFavorite: boolean) => void;
}

export function FavoriteButton({
  recipeId,
  initialFavorite,
  compact = false,
  onToggled,
}: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [isPending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    // Prevent navigating when inside a Link
    e.preventDefault();
    e.stopPropagation();

    startTransition(async () => {
      const result = await toggleFavorite(recipeId);
      if (result.success && result.isFavorite !== undefined) {
        setIsFavorite(result.isFavorite);
        onToggled?.(result.isFavorite);
      }
    });
  }

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={isPending}
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        className={`rounded-full p-1.5 transition-colors ${
          isPending ? "opacity-50" : ""
        } ${
          isFavorite
            ? "text-amber-500 hover:text-amber-600"
            : "text-zinc-300 hover:text-amber-400 dark:text-zinc-600 dark:hover:text-amber-400"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill={isFavorite ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={isFavorite ? 0 : 2}
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
          />
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
        isPending ? "opacity-50" : ""
      } ${
        isFavorite
          ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400 dark:hover:bg-amber-900"
          : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill={isFavorite ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={isFavorite ? 0 : 2}
        className="h-4 w-4"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
        />
      </svg>
      {isFavorite ? "Favorited" : "Favorite"}
    </button>
  );
}
