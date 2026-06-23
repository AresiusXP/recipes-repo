import { Suspense } from "react";
import { requireAuth } from "@/lib/require-auth";
import { RecipeList } from "@/components/RecipeList";
import { RecipeListSkeleton } from "@/components/RecipeListSkeleton";
import { searchRecipes, getUserTags } from "@/app/actions/recipes";

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tags?: string }>;
}) {
  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Favorite Recipes
      </h1>
      <Suspense fallback={<RecipeListSkeleton />}>
        <FavoritesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function FavoritesContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tags?: string }>;
}) {
  await requireAuth();

  const { q = "", tags = "" } = await searchParams;
  const tagList = tags ? tags.split(",").filter(Boolean) : [];

  // Fetch initial data server-side — favorites only
  const [initialRecipes, initialTags] = await Promise.all([
    searchRecipes({ q, tags: tagList, favorites: true }),
    getUserTags(),
  ]);

  return (
    <RecipeList
      initialRecipes={initialRecipes}
      initialTags={initialTags}
      favoritesOnly
    />
  );
}
