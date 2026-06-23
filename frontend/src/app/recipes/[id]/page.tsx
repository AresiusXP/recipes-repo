import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAuth } from "@/lib/require-auth";
import { getRecipe } from "@/lib/api-client";
import { DeleteRecipeButton } from "@/components/DeleteRecipeButton";
import { FavoriteButton } from "@/components/FavoriteButton";
import { CookThisWeekButton } from "@/components/CookThisWeekButton";
import { TranslateRecipeButton } from "@/components/TranslateRecipeButton";
import { ShareRecipeButton } from "@/components/ShareRecipeButton";
import { RecipeDetailSkeleton } from "@/components/RecipeDetailSkeleton";
import type { TargetLanguage } from "@/lib/gemini";

export default function RecipeDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<RecipeDetailSkeleton />}>
      <RecipeDetailContent params={props.params} />
    </Suspense>
  );
}

async function RecipeDetailContent({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;

  let recipe;
  try {
    recipe = await getRecipe(id);
  } catch {
    notFound();
  }

  if (!recipe) {
    notFound();
  }

  const ingredients = recipe.ingredients ?? [];
  const steps = recipe.steps ?? [];
  const tags = recipe.tags ?? [];

  // Show translate button if:
  // - URL recipes: always (source can be re-scraped any time)
  // - Manual recipes: only if not yet translated (one-time limit)
  const hasSourceUrl = !!recipe.sourceUrl;
  const isManualImport = !hasSourceUrl;
  const showTranslateButton = hasSourceUrl || !recipe.hasBeenTranslated;

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
              <TranslateRecipeButton
                recipeId={id}
                isManualImport={isManualImport}
                hasBeenTranslated={recipe.hasBeenTranslated}
                currentTranslatedLanguage={(recipe.translatedLanguage as TargetLanguage | null) ?? null}
                sourceLanguage={recipe.sourceLanguage ?? null}
              />
            )}
            <FavoriteButton
              recipeId={id}
              initialFavorite={recipe.isFavorite}
            />
            <CookThisWeekButton
              recipeId={id}
              initialCookThisWeekUntil={recipe.cookThisWeekUntil ?? null}
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
              {(() => { try { return new URL(recipe.sourceUrl).hostname; } catch { return recipe.sourceUrl; } })()}
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
