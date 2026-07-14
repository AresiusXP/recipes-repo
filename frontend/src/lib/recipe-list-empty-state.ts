export interface EmptyStateParams {
  hasActiveFilters: boolean;
  favoritesOnly: boolean;
}

export interface EmptyStateContent {
  heading: string;
  subtext: string;
  /** Only shown when there are no active filters — link target and label. */
  cta: { href: string; label: string } | null;
}

/**
 * Determines the copy and optional CTA shown when a recipe list has no
 * results. Keeps favorites-specific messaging distinct from the general
 * "no recipes yet" case, and both distinct from a filtered "no matches" case.
 */
export function getRecipeListEmptyState({
  hasActiveFilters,
  favoritesOnly,
}: EmptyStateParams): EmptyStateContent {
  if (hasActiveFilters) {
    return {
      heading: favoritesOnly
        ? "No favorites match your search"
        : "No recipes match your search",
      subtext: "Try different search terms or filters",
      cta: null,
    };
  }

  if (favoritesOnly) {
    return {
      heading: "No favorite recipes yet",
      subtext: "Tap the heart on a recipe to add it to your favorites.",
      cta: { href: "/recipes", label: "Browse Recipes" },
    };
  }

  return {
    heading: "No recipes yet",
    subtext: "Add your first recipe to get started!",
    cta: { href: "/recipes/new", label: "Add Your First Recipe" },
  };
}
