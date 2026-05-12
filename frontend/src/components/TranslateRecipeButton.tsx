"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { translateRecipe } from "@/app/actions/recipes";
import type { TargetLanguage } from "@/lib/gemini";

interface TranslateRecipeButtonProps {
  recipeId: string;
  /** True when the recipe was entered manually (no source URL). */
  isManualImport: boolean;
  /** True once any translation has been applied (manual recipes: blocks further translation). */
  hasBeenTranslated: boolean;
  /** The language the recipe is currently displayed in, or null = original. */
  currentTranslatedLanguage: TargetLanguage | null;
  /** Detected source language code (e.g. "es", "en", "fr"), or null if unknown. */
  sourceLanguage: string | null;
}

const LANGUAGE_LABELS: Record<TargetLanguage, string> = {
  en: "English",
  nl: "Dutch",
  es: "Spanish",
};

const ALL_LANGUAGES: TargetLanguage[] = ["en", "nl", "es"];

// ─── Translation progress messages ───

interface TranslationStage {
  message: string;
  minMs: number;
}

const URL_TRANSLATION_STAGES: TranslationStage[] = [
  { message: "Re-fetching recipe page…", minMs: 2500 },
  { message: "Translating with AI…", minMs: 4000 },
  { message: "Saving translation…", minMs: 0 },
];

const MANUAL_TRANSLATION_STAGES: TranslationStage[] = [
  { message: "Translating with AI…", minMs: 4000 },
  { message: "Saving translation…", minMs: 0 },
];

const REVERT_STAGES: TranslationStage[] = [
  { message: "Reverting to original…", minMs: 0 },
];

function useTranslationProgress(active: boolean, stages: TranslationStage[]): string {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setStageIndex(0);
      return;
    }

    let idx = 0;
    setStageIndex(0);

    function advance() {
      idx = Math.min(idx + 1, stages.length - 1);
      setStageIndex(idx);
      if (idx < stages.length - 1 && stages[idx].minMs > 0) {
        timer = setTimeout(advance, stages[idx].minMs);
      }
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    if (stages[0].minMs > 0) {
      timer = setTimeout(advance, stages[0].minMs);
    }

    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return stages[Math.min(stageIndex, stages.length - 1)].message;
}

export function TranslateRecipeButton({
  recipeId,
  isManualImport,
  hasBeenTranslated,
  currentTranslatedLanguage,
  sourceLanguage,
}: TranslateRecipeButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<TargetLanguage | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Pick the right stage sequence based on what was selected
  const translationStages =
    selectedTarget === null
      ? REVERT_STAGES
      : isManualImport
      ? MANUAL_TRANSLATION_STAGES
      : URL_TRANSLATION_STAGES;

  const progressMessage = useTranslationProgress(translating, translationStages);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  async function handleSelect(target: TargetLanguage | null) {
    setOpen(false);
    setSelectedTarget(target);
    setTranslating(true);
    setError(null);
    try {
      const result = await translateRecipe(recipeId, target);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error ?? "Translation failed. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setTranslating(false);
      setSelectedTarget(undefined);
    }
  }

  // Build the list of menu items.
  // "Show original" appears only when the recipe is currently translated.
  // For manual imports that have already been translated, we only allow "Show original".
  const isCurrentlyTranslated = currentTranslatedLanguage !== null;
  const manualTranslationExhausted = isManualImport && hasBeenTranslated;

  const languageItems: Array<{ label: string; target: TargetLanguage | null; disabled: boolean }> = [];

  // Language options — disabled if this is the currently active language,
  // or if we're showing original and this language IS the source language
  if (!manualTranslationExhausted) {
    for (const lang of ALL_LANGUAGES) {
      const isActiveLang = currentTranslatedLanguage === lang;
      const isSourceLang = currentTranslatedLanguage === null && sourceLanguage === lang;
      languageItems.push({
        label: LANGUAGE_LABELS[lang],
        target: lang,
        disabled: isActiveLang || isSourceLang,
      });
    }
  }

  // "Show original" — only shown when translated; disabled if already showing original
  if (isCurrentlyTranslated) {
    languageItems.push({
      label: "Show original",
      target: null,
      disabled: false,
    });
  }

  // If there are no usable items (e.g. already in original and manual limit hit), hide the button
  if (languageItems.length === 0) return null;

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={translating}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {translating ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            {progressMessage}
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M9 2.25a.75.75 0 0 1 .75.75v1.506a49.384 49.384 0 0 1 5.343.371.75.75 0 1 1-.186 1.489c-.66-.083-1.323-.151-1.99-.206l-1.72 4.3a12.07 12.07 0 0 0 5.023 1.054.75.75 0 0 1 0 1.5 13.571 13.571 0 0 1-6.146-1.455l-.9 2.25c1.083.399 2.14.858 3.165 1.38a.75.75 0 1 1-.68 1.337 26.518 26.518 0 0 0-3.275-1.424l-.142.355a.75.75 0 1 1-1.392-.557l.222-.555A27.076 27.076 0 0 0 3.75 15a.75.75 0 0 1 0-1.5c1.08 0 2.145.073 3.192.216l.896-2.241a13.476 13.476 0 0 1-3.122-.798.75.75 0 0 1 .482-1.42 11.975 11.975 0 0 0 3.56.752l1.72-4.299A49.178 49.178 0 0 0 6.75 4.506V6a.75.75 0 0 1-1.5 0V3A.75.75 0 0 1 6 2.25h3Z"
                clipRule="evenodd"
              />
              <path d="M21.687 16.5h-3.375l-.75-1.5h4.875l-.75 1.5ZM19.5 12l2.953 6H22.5a.75.75 0 0 1 0 1.5h-3.375a.75.75 0 0 1-.69-.458l-3.248-6.75a.75.75 0 0 1 1.36-.636L19.5 12ZM16.5 18h-.375a.75.75 0 0 1 0-1.5h.375V18Z" />
            </svg>
            {isCurrentlyTranslated
              ? `Translated: ${LANGUAGE_LABELS[currentTranslatedLanguage]}`
              : "Translate"}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5 opacity-60"
            >
              <path
                fillRule="evenodd"
                d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </>
        )}
      </button>

      {/* Dropdown menu */}
      {open && !translating && (
        <div
          role="menu"
          aria-label="Translation options"
          className="absolute left-0 z-20 mt-1.5 w-44 origin-top-left rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
        >
          {/* Section header for language targets */}
          {!manualTranslationExhausted && (
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              Translate to
            </p>
          )}
          {languageItems.map((item) => (
            <button
              key={item.target ?? "__original__"}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => handleSelect(item.target)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                item.disabled
                  ? "cursor-default text-zinc-400 dark:text-zinc-500"
                  : item.target === null
                  ? "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                  : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {item.disabled && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-primary">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
              )}
              {item.target === null && !item.disabled && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 opacity-60">
                  <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 0 1-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 0 1 0 10.75H10.75a.75.75 0 0 1 0-1.5h2.875a3.875 3.875 0 0 0 0-7.75H3.622l4.146 3.957a.75.75 0 0 1-1.036 1.085l-5.5-5.25a.75.75 0 0 1 0-1.085l5.5-5.25a.75.75 0 0 1 1.06.025Z" clipRule="evenodd" />
                </svg>
              )}
              {!item.disabled && item.target !== null && (
                <span className="h-3.5 w-3.5 shrink-0" />
              )}
              <span>{item.label}</span>
              {item.target === null && sourceLanguage && sourceLanguage !== "en" && (
                <span className="ml-auto text-xs uppercase text-zinc-400 dark:text-zinc-500">
                  {sourceLanguage}
                </span>
              )}
            </button>
          ))}

          {/* Divider before "Show original" when there are language options above it */}
          {isCurrentlyTranslated && !manualTranslationExhausted && (
            <div className="my-1 border-t border-zinc-100 dark:border-zinc-700" />
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
