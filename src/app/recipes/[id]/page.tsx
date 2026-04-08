import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { DeleteRecipeButton } from "@/components/DeleteRecipeButton";
import { FavoriteButton } from "@/components/FavoriteButton";

export default async function RecipeDetailPage(props: { params: Promise<{ id: string }> }) {
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

  const ingredients: string[] = JSON.parse(recipe.ingredients);
  const steps: string[] = JSON.parse(recipe.steps);
  const tags = recipe.tags.map((rt: { tag: { name: string } }) => rt.tag.name);

  return (
    <article className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            {recipe.title}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <FavoriteButton
              recipeId={id}
              initialFavorite={recipe.isFavorite}
            />
            <Link
              href={`/recipes/${id}/edit`}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Edit
            </Link>
            <DeleteRecipeButton recipeId={id} />
          </div>
        </div>
        {recipe.description && (
          <p className="text-zinc-600 dark:text-zinc-400">{recipe.description}</p>
        )}
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map((tag: string) => (
              <span
                key={tag}
                className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {recipe.sourceUrl && (
          <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-500">
            Source:{" "}
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              {new URL(recipe.sourceUrl).hostname}
            </a>
          </p>
        )}
      </div>

      {/* Image */}
      {recipe.imagePath && (
        <div className="mb-8 overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={recipe.imagePath}
            alt={recipe.title}
            className="w-full object-cover"
          />
        </div>
      )}

      {/* Ingredients */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Ingredients
        </h2>
        <ul className="space-y-2">
          {ingredients.map((ingredient, i) => (
            <li
              key={i}
              className="flex items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {ingredient}
            </li>
          ))}
        </ul>
      </section>

      {/* Steps */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Steps
        </h2>
        <ol className="space-y-4">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-4 text-sm text-zinc-700 dark:text-zinc-300">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <p className="pt-0.5">{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
