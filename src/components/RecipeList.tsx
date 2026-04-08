"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { searchRecipes } from "@/app/actions/recipes";
import { FavoriteButton } from "@/components/FavoriteButton";

interface RecipeSummary {
  id: string;
  title: string;
  description: string | null;
  imagePath: string | null;
  sourceUrl: string | null;
  isFavorite: boolean;
  tags: string[];
  createdAt: string;
}

interface RecipeListProps {
  initialRecipes: RecipeSummary[];
  initialTags: string[];
  favoritesOnly?: boolean;
}

export function RecipeList({ initialRecipes, initialTags, favoritesOnly = false }: RecipeListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [recipes, setRecipes] = useState<RecipeSummary[]>(initialRecipes);
  const [allTags, setAllTags] = useState<string[]>(initialTags);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [selectedTags, setSelectedTags] = useState<string[]>(
    searchParams.get("tags")?.split(",").filter(Boolean) || []
  );
  const [loading, setLoading] = useState(false);
  const [showTags, setShowTags] = useState(false);

  const loadRecipes = useCallback(async () => {
    setLoading(true);
    try {
      const results = await searchRecipes(query, selectedTags, favoritesOnly);
      setRecipes(results);
    } catch (err) {
      console.error("Failed to load recipes:", err);
    } finally {
      setLoading(false);
    }
  }, [query, selectedTags, favoritesOnly]);

  // Reload recipes when query or tags change (skip initial render)
  const [isInitialRender, setIsInitialRender] = useState(true);
  useEffect(() => {
    if (isInitialRender) {
      setIsInitialRender(false);
      return;
    }
    const timer = setTimeout(() => {
      loadRecipes();

      // Update URL search params
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
      const newUrl = params.toString() ? `?${params.toString()}` : favoritesOnly ? "/recipes/favorites" : "/recipes";
      router.replace(newUrl, { scroll: false });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, selectedTags, loadRecipes, router, isInitialRender]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  return (
    <div>
      {/* Search and filter header */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipes..."
              className="w-full rounded-lg border border-zinc-200 bg-white py-2.5 pl-10 pr-3 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500"
            />
          </div>
          {allTags.length > 0 && (
            <button
              onClick={() => setShowTags(!showTags)}
              className={`flex items-center gap-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                showTags || selectedTags.length > 0
                  ? "border-primary bg-primary/10 text-primary dark:border-primary dark:text-primary"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              Tags
              {selectedTags.length > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs text-white">
                  {selectedTags.length}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Tag filter chips */}
        {showTags && allTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedTags.includes(tag)
                    ? "bg-primary text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {tag}
              </button>
            ))}
            {selectedTags.length > 0 && (
              <button
                onClick={() => setSelectedTags([])}
                className="rounded-full px-3 py-1 text-xs font-medium text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Recipe grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <svg
            className="h-8 w-8 animate-spin text-primary"
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
        </div>
      ) : recipes.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg font-medium text-zinc-500 dark:text-zinc-400">
            {query || selectedTags.length > 0
              ? "No recipes match your search"
              : "No recipes yet"}
          </p>
          <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">
            {query || selectedTags.length > 0
              ? "Try different search terms or tags"
              : "Add your first recipe to get started!"}
          </p>
          {!(query || selectedTags.length > 0) && (
            <Link
              href="/recipes/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-dark"
            >
              Add Your First Recipe
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {recipes.map((recipe) => (
            <Link
              key={recipe.id}
              href={`/recipes/${recipe.id}`}
              className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="absolute right-2 top-2 z-10">
                <FavoriteButton
                  recipeId={recipe.id}
                  initialFavorite={recipe.isFavorite}
                  compact
                  onToggled={(isFav) => {
                    if (favoritesOnly && !isFav) {
                      setRecipes((prev) => prev.filter((r) => r.id !== recipe.id));
                    }
                  }}
                />
              </div>
              {recipe.imagePath && (
                <div className="aspect-video w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={recipe.imagePath}
                    alt={recipe.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </div>
              )}
              <div className="p-4">
                <h2 className="font-semibold text-zinc-900 group-hover:text-primary dark:text-zinc-50">
                  {recipe.title}
                </h2>
                {recipe.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
                    {recipe.description}
                  </p>
                )}
                {recipe.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {recipe.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      >
                        {tag}
                      </span>
                    ))}
                    {recipe.tags.length > 4 && (
                      <span className="text-xs text-zinc-400">
                        +{recipe.tags.length - 4} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
