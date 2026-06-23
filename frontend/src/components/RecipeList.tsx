"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { searchRecipes } from "@/app/actions/recipes";
import { FavoriteButton } from "@/components/FavoriteButton";
import { formatReadable, isCookThisWeekActive } from "@/lib/cook-this-week";

type ViewMode = "grid" | "list";
const VIEW_MODE_KEY = "recipes:view-mode";
const SCROLL_KEY_PREFIX = "recipes:scroll-y:";

interface RecipeSummary {
  id: string;
  title: string;
  description: string | null;
  imagePath: string | null;
  sourceUrl: string | null;
  isFavorite: boolean;
  cookThisWeekUntil: string | null;
  tags: string[] | null;
  createdAt: string;
}

interface RecipeListProps {
  initialRecipes: RecipeSummary[];
  initialTags: string[];
  favoritesOnly?: boolean;
  initialCookThisWeekOnly?: boolean;
}

export function RecipeList({
  initialRecipes,
  initialTags,
  favoritesOnly = false,
  initialCookThisWeekOnly = false,
}: RecipeListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [recipes, setRecipes] = useState<RecipeSummary[]>(initialRecipes);
  const [allTags] = useState<string[]>(initialTags);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [selectedTags, setSelectedTags] = useState<string[]>(
    searchParams.get("tags")?.split(",").filter(Boolean) || []
  );
  const [cookThisWeekOnly, setCookThisWeekOnly] = useState(initialCookThisWeekOnly);
  const [loading, setLoading] = useState(false);
  const [showTags, setShowTags] = useState(false);

  // View mode — default to grid; read persisted preference after mount to avoid hydration mismatch
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      if (saved === "list" || saved === "grid") {
        setViewMode(saved);
      }
    } catch {
      // localStorage not available (e.g. SSR or private mode); keep default
    }
  }, []);

  // ── Scroll position preservation (manual) ──────────────────────────────────
  // The recipe list re-renders fresh on browser Back (the page is dynamic and
  // per-user, so it is re-fetched). Without help, that lands the user at the
  // top. We save scrollY when leaving for a recipe and restore it on return,
  // re-asserting across animation frames for a short window so the restore
  // outlasts the on-Back re-render/data-refetch (and late image layout) that
  // would otherwise reset us to the top.
  const scrollKey = SCROLL_KEY_PREFIX + (favoritesOnly ? "/recipes/favorites" : "/recipes");

  useEffect(() => {
    let savedY: number | null = null;
    try {
      const raw = sessionStorage.getItem(scrollKey);
      if (raw !== null) {
        sessionStorage.removeItem(scrollKey);
        const y = parseInt(raw, 10);
        if (!isNaN(y) && y > 0) savedY = y;
      }
    } catch {
      // sessionStorage unavailable; nothing to restore
    }
    if (savedY === null) return;

    const target = savedY;
    let rafId = 0;
    const start = performance.now();
    const WINDOW_MS = 1000;

    // Stop immediately if the user actively interacts (a plain `scroll` event
    // can't be trusted — the framework's reset-to-top fires one too — but these
    // input events reliably mean deliberate user intent, so we yield to it).
    let userInteracted = false;
    const onInteract = () => {
      userInteracted = true;
    };
    const interactionEvents = ["wheel", "touchmove", "mousedown", "keydown"] as const;
    interactionEvents.forEach((evt) =>
      window.addEventListener(evt, onInteract, { passive: true })
    );

    const cleanup = () => {
      cancelAnimationFrame(rafId);
      interactionEvents.forEach((evt) => window.removeEventListener(evt, onInteract));
    };

    const tick = () => {
      if (userInteracted) {
        cleanup();
        return;
      }
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const desired = Math.min(target, Math.max(0, maxScroll));
      if (Math.abs(window.scrollY - desired) > 2) {
        window.scrollTo({ top: desired, behavior: "instant" });
      }
      if (performance.now() - start < WINDOW_MS) {
        rafId = requestAnimationFrame(tick);
      } else {
        cleanup();
      }
    };
    rafId = requestAnimationFrame(tick);

    return cleanup;
  }, [scrollKey]);

  function saveScrollPosition(e: React.MouseEvent) {
    // Skip modified / middle clicks — those open a new tab; the current page
    // stays put, so a saved position would be misleading on the next visit.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) {
      return;
    }
    try {
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    } catch {
      // sessionStorage unavailable; ignore
    }
  }

  function handleSetViewMode(mode: ViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // ignore write errors
    }
  }

  const loadRecipes = useCallback(async () => {
    setLoading(true);
    try {
      const results = await searchRecipes({ q: query, tags: selectedTags, favorites: favoritesOnly, cookThisWeek: cookThisWeekOnly });
      setRecipes(results);
    } catch (err) {
      console.error("Failed to load recipes:", err);
    } finally {
      setLoading(false);
    }
  }, [query, selectedTags, favoritesOnly, cookThisWeekOnly]);

  // Reload recipes when query, tags, or week filter change (skip initial render)
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
      if (cookThisWeekOnly) params.set("week", "1");
      const newUrl = params.toString()
        ? `?${params.toString()}`
        : favoritesOnly
        ? "/recipes/favorites"
        : "/recipes";
      router.replace(newUrl, { scroll: false });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, selectedTags, cookThisWeekOnly, loadRecipes, router, isInitialRender, favoritesOnly]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  // Determine effective view mode: during SSR / before mount always use grid
  // so the server-rendered HTML matches the initial client render.
  const effectiveView: ViewMode = isMounted ? viewMode : "grid";

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
              className="w-full rounded-2xl border border-zinc-200/80 bg-white/80 py-3 pl-11 pr-4 text-base text-zinc-900 placeholder-zinc-400 shadow-sm backdrop-blur-sm transition-all focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/10 dark:border-zinc-800/80 dark:bg-zinc-800/60 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:bg-zinc-800"
            />
          </div>

          {/* Cook this week filter toggle */}
          {!favoritesOnly && (
            <button
              onClick={() => setCookThisWeekOnly((prev) => !prev)}
              aria-pressed={cookThisWeekOnly}
              className={`flex items-center gap-1.5 rounded-2xl border px-4 py-3 text-sm font-medium transition-all ${
                cookThisWeekOnly
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
              title="Show only recipes marked for this week"
            >
              {/* Calendar icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill={cookThisWeekOnly ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={cookThisWeekOnly ? 0 : 2}
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                />
              </svg>
              <span className="hidden sm:inline">This week</span>
            </button>
          )}

          {allTags.length > 0 && (
            <button
              onClick={() => setShowTags(!showTags)}
              className={`flex items-center gap-1.5 rounded-2xl border px-4 py-3 text-sm font-medium transition-all ${
                showTags || selectedTags.length > 0
                  ? "border-primary bg-primary/10 text-primary dark:border-primary dark:text-primary"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
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

          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
            {/* Grid view button */}
            <button
              onClick={() => handleSetViewMode("grid")}
              aria-label="Grid view"
              aria-pressed={effectiveView === "grid"}
              className={`rounded-md p-1.5 transition-colors ${
                effectiveView === "grid"
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            {/* List view button */}
            <button
              onClick={() => handleSetViewMode("list")}
              aria-label="List view"
              aria-pressed={effectiveView === "list"}
              className={`rounded-md p-1.5 transition-colors ${
                effectiveView === "list"
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
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
                  d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
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

      {/* Recipe list / grid */}
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
            {query || selectedTags.length > 0 || cookThisWeekOnly
              ? "No recipes match your search"
              : "No recipes yet"}
          </p>
          <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">
            {query || selectedTags.length > 0 || cookThisWeekOnly
              ? "Try different search terms or filters"
              : "Add your first recipe to get started!"}
          </p>
          {!(query || selectedTags.length > 0 || cookThisWeekOnly) && (
            <Link
              href="/recipes/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-dark"
            >
              Add Your First Recipe
            </Link>
          )}
        </div>
      ) : effectiveView === "grid" ? (
        /* ── Grid view ── */
        <div className="grid gap-4 sm:grid-cols-2">
          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="group relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/80 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-800/60"
            >
              {/* Favorite button sits above the link, outside it */}
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
              <Link
                href={`/recipes/${recipe.id}`}
                onClick={saveScrollPosition}
                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
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
                  <h2 className="font-serif text-xl font-semibold text-zinc-900 group-hover:text-primary dark:text-zinc-50">
                    {recipe.title}
                  </h2>
                  {recipe.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {recipe.description}
                    </p>
                  )}
                  {/* Cook this week badge */}
                  {isCookThisWeekActive(recipe.cookThisWeekUntil) && (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-3 w-3"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      By {formatReadable(recipe.cookThisWeekUntil!)}
                    </span>
                  )}
                  {(recipe.tags ?? []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(recipe.tags ?? []).slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        >
                          {tag}
                        </span>
                      ))}
                      {(recipe.tags ?? []).length > 4 && (
                        <span className="text-xs text-zinc-400">
                          +{(recipe.tags ?? []).length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        /* ── List view ── */
        <div className="flex flex-col gap-2">
          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="group relative flex items-center overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/80 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-800/60"
            >
              <Link
                href={`/recipes/${recipe.id}`}
                onClick={saveScrollPosition}
                className="flex min-w-0 flex-1 items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {/* Thumbnail */}
                <div className="h-16 w-16 shrink-0 overflow-hidden bg-zinc-100 dark:bg-zinc-800 sm:h-20 sm:w-20">
                  {recipe.imagePath ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={recipe.imagePath}
                      alt={recipe.title}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6 text-zinc-300 dark:text-zinc-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 py-2">
                  <h2 className="truncate font-serif text-lg font-semibold text-zinc-900 group-hover:text-primary dark:text-zinc-50">
                    {recipe.title}
                  </h2>
                  {recipe.description && (
                    <p className="mt-0.5 line-clamp-1 text-sm text-zinc-500 dark:text-zinc-400">
                      {recipe.description}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {/* Cook this week badge */}
                    {isCookThisWeekActive(recipe.cookThisWeekUntil) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-3 w-3"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z"
                            clipRule="evenodd"
                          />
                        </svg>
                        By {formatReadable(recipe.cookThisWeekUntil!)}
                      </span>
                    )}
                    {(recipe.tags ?? []).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      >
                        {tag}
                      </span>
                    ))}
                    {(recipe.tags ?? []).length > 3 && (
                      <span className="text-xs text-zinc-400">
                        +{(recipe.tags ?? []).length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              </Link>

              {/* Favorite button — outside the Link to avoid nested interactive elements */}
              <div className="shrink-0 px-3">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
