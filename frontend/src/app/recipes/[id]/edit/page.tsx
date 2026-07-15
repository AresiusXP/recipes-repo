import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/require-auth";
import { getRecipe } from "@/lib/api-client";
import { RecipeEditForm } from "@/components/RecipeEditForm";

export default async function EditRecipePage(props: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await props.params;

  let recipe;
  try {
    recipe = await getRecipe(id);
  } catch {
    notFound();
  }

  if (!recipe || recipe.userId !== session.user.id) {
    notFound();
  }

  const initialData = {
    title: recipe.title,
    description: recipe.description || "",
    ingredients: recipe.ingredients ?? [],
    steps: recipe.steps ?? [],
    tags: recipe.tags ?? [],
  };

  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/90 p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-800/80 sm:p-10 sm:backdrop-blur-sm">
      <h1 className="mb-6 font-serif text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Edit Recipe
      </h1>
      <RecipeEditForm recipeId={id} initialData={initialData} initialImagePath={recipe.imagePath} />
    </div>
  );
}
