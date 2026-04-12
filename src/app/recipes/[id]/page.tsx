import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { DeleteRecipeButton } from "@/components/DeleteRecipeButton";
import { FavoriteButton } from "@/components/FavoriteButton";
import { CookThisWeekButton } from "@/components/CookThisWeekButton";
import { TranslateRecipeButton } from "@/components/TranslateRecipeButton";
import { ShareRecipeButton } from "@/components/ShareRecipeButton";

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
      sharedBy: {
        select: { name: true, email: true },
      },
    },
  });

  if (!recipe || recipe.userId !== session.user.id) {
    notFound();
  }

  const ingredients: string[] = JSON.parse(recipe.ingredients);
  const steps: string[] = JSON.parse(recipe.steps);
  const tags = recipe.tags.map((rt: { tag: { name: string } }) => rt.tag.name);

  // Show translate button if recipe is not in English and hasn't been translated
  const showTranslateButton =
    recipe.sourceLanguage !== null &&
    recipe.sourceLanguage !== "en" &&
    !recipe.isTranslatedToEnglish;

  const sharedBy = recipe.sharedBy;

  return (
    <article className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-800/80 sm:p-10">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-4">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {recipe.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {showTranslateButton && (
              <TranslateRecipeButton recipeId={id} />
            )}
            <FavoriteButton
              recipeId={id}
              initialFavorite={recipe.isFavorite}
            />
            <CookThisWeekButton
              recipeId={id}
              initialCookThisWeekUntil={recipe.cookThisWeekUntil?.toISOString() ?? null}
            />
            <ShareRecipeButton recipeId={id} />
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
        {sharedBy && (
          <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">
            Shared by{" "}
            <span className="font-medium text-zinc-600 dark:text-zinc-300">
              {sharedBy.name ?? sharedBy.email ?? "a user"}
            </span>
          </p>
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
        <div className="mb-10 overflow-hidden rounded-2xl shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={recipe.imagePath}
            alt={recipe.title}
            className="w-full object-cover"
          />
        </div>
      )}

      {/* Ingredients */}
      <section className="mb-12 rounded-2xl bg-zinc-50/50 p-6 dark:bg-zinc-800/20 sm:p-8">
        <h2 className="mb-6 font-serif text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Ingredients
        </h2>
        <ul className="space-y-4">
          {ingredients.map((ingredient, i) => (
            <li
              key={i}
              className="flex items-start gap-4 text-lg text-zinc-700 dark:text-zinc-300"
            >
              <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
              <span className="leading-relaxed">{ingredient}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Steps */}
      <section className="mb-8">
        <h2 className="mb-6 font-serif text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Instructions
        </h2>
        <ol className="space-y-8">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-5 text-lg text-zinc-700 dark:text-zinc-300">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-serif text-sm font-bold text-primary">
                {i + 1}
              </span>
              <p className="pt-0.5 leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
