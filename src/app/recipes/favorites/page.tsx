import { requireAuth } from "@/lib/require-auth";
import { RecipeList } from "@/components/RecipeList";
import { searchRecipes, getUserTags } from "@/app/actions/recipes";

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tags?: string }>;
}) {
  await requireAuth();

  const { q = "", tags = "" } = await searchParams;
  const tagList = tags ? tags.split(",").filter(Boolean) : [];

  // Fetch initial data server-side — favorites only
  const [initialRecipes, initialTags] = await Promise.all([
    searchRecipes(q, tagList, true),
    getUserTags(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Favorite Recipes
      </h1>
      <RecipeList
        initialRecipes={initialRecipes}
        initialTags={initialTags}
        favoritesOnly
      />
    </div>
  );
}
