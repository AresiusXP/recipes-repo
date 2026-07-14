import { describe, expect, it } from "vitest";
import { getRecipeListEmptyState } from "@/lib/recipe-list-empty-state";

describe("getRecipeListEmptyState", () => {
  it("shows the generic no-matches message when filters are active", () => {
    const result = getRecipeListEmptyState({
      hasActiveFilters: true,
      favoritesOnly: false,
    });
    expect(result.heading).toBe("No recipes match your search");
    expect(result.cta).toBeNull();
  });

  it("shows a favorites-specific no-matches message when filters are active on favorites", () => {
    const result = getRecipeListEmptyState({
      hasActiveFilters: true,
      favoritesOnly: true,
    });
    expect(result.heading).toBe("No favorites match your search");
    expect(result.cta).toBeNull();
  });

  it("shows the default empty state with an add-recipe CTA on the main list", () => {
    const result = getRecipeListEmptyState({
      hasActiveFilters: false,
      favoritesOnly: false,
    });
    expect(result.heading).toBe("No recipes yet");
    expect(result.cta).toEqual({ href: "/recipes/new", label: "Add Your First Recipe" });
  });

  it("shows a favorites-specific empty state with a browse CTA on the favorites list", () => {
    const result = getRecipeListEmptyState({
      hasActiveFilters: false,
      favoritesOnly: true,
    });
    expect(result.heading).toBe("No favorite recipes yet");
    expect(result.cta).toEqual({ href: "/recipes", label: "Browse Recipes" });
  });
});
