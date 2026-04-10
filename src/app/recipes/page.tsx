import { requireAuth } from "@/lib/require-auth";
import { RecipeList } from "@/components/RecipeList";
import { searchRecipes, getUserTags } from "@/app/actions/recipes";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tags?: string }>;
}) {
  await requireAuth();

  const { q = "", tags = "" } = await searchParams;
  const tagList = tags ? tags.split(",").filter(Boolean) : [];

  // Fetch initial data server-side to avoid loading flicker
  const [initialRecipes, initialTags] = await Promise.all([
    searchRecipes(q, tagList),
    getUserTags(),
  ]);

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        My Recipes
      </h1>
      <RecipeList initialRecipes={initialRecipes} initialTags={initialTags} />
    </div>
  );
}
