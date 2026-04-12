import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { RecipeEditForm } from "@/components/RecipeEditForm";

export default async function EditRecipePage(props: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await props.params;

  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
    },
  });

  if (!recipe || recipe.userId !== session.user.id) {
    notFound();
  }

  const initialData = {
    title: recipe.title,
    description: recipe.description || "",
    ingredients: JSON.parse(recipe.ingredients) as string[],
    steps: JSON.parse(recipe.steps) as string[],
    tags: recipe.tags.map((rt: { tag: { name: string } }) => rt.tag.name),
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 font-serif text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Edit Recipe
      </h1>
      <RecipeEditForm recipeId={id} initialData={initialData} initialImagePath={recipe.imagePath} />
    </div>
  );
}
