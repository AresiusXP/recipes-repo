"use client";

// This is a pure client component (no server-side request-time data reads), so
// it needs no <Suspense> boundary under Cache Components — it compiles as a
// static shell and hydrates on the client. Auth gating for this route is
// enforced by the backend on submit (the import server actions).

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { importRecipeFromUrl, importRecipeFromText } from "@/app/actions/recipes";
import {
  IMAGE_ALLOWED_TYPES,
  IMAGE_MAX_SIZE,
  IMAGE_ACCEPT_LABEL,
  IMAGE_INPUT_ACCEPT,
} from "@/lib/image-constants";

type ImportMode = "url" | "text";

// ─── Progress messaging ───

interface ProgressStage {
  message: string;
  /** Minimum ms before advancing to the next stage (approximate). */
  minMs: number;
}

const URL_IMPORT_STAGES: ProgressStage[] = [
  { message: "Opening recipe page…", minMs: 2000 },
  { message: "Fetching page content…", minMs: 3000 },
  { message: "Extracting recipe with AI…", minMs: 4000 },
  { message: "Almost done…", minMs: 0 },
];

const TEXT_IMPORT_STAGES: ProgressStage[] = [
  { message: "Reading recipe text…", minMs: 1500 },
  { message: "Extracting recipe with AI…", minMs: 4000 },
  { message: "Almost done…", minMs: 0 },
];

/**
 * Cycles through progress stage messages while a long-running operation is in flight.
 * Returns the current message and a cleanup function.
 */
function useProgressMessages(
  active: boolean,
  stages: ProgressStage[]
): string {
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

export default function NewRecipePage() {
  const router = useRouter();
  const [mode, setMode] = useState<ImportMode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [textSourceUrl, setTextSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteBlocked, setSiteBlocked] = useState(false);

  // Image picker state (text mode only)
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageMessage, setImageMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Progress messages — use URL stages by default; text stages for text mode
  const stages = mode === "text" ? TEXT_IMPORT_STAGES : URL_IMPORT_STAGES;
  const progressMessage = useProgressMessages(loading, stages);

  // Revoke object URL on cleanup / mode switch
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Clear image state when switching modes
  function switchMode(next: ImportMode) {
    if (next !== mode) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setImageFile(null);
      setImageMessage(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    setMode(next);
    setError(null);
    setSiteBlocked(false);
  }

  /** Switch to text mode and pre-fill the source URL with the blocked URL. */
  function switchToTextWithUrl() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImageFile(null);
    setImageMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setTextSourceUrl(url);
    setMode("text");
    setError(null);
    setSiteBlocked(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!IMAGE_ALLOWED_TYPES.includes(file.type as typeof IMAGE_ALLOWED_TYPES[number])) {
      setImageMessage("Please select a JPEG, PNG, WebP, or GIF image.");
      return;
    }

    if (file.size > IMAGE_MAX_SIZE) {
      setImageMessage("Image must be under 10MB.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setImageFile(file);
    setImageMessage(null);
  }

  function handleCancelImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImageFile(null);
    setImageMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSiteBlocked(false);

    try {
      const result =
        mode === "url"
          ? await importRecipeFromUrl(url)
          : await importRecipeFromText(text, textSourceUrl || undefined, imageFile ?? null);

      if (result.success && result.recipeId) {
        router.push(`/recipes/${result.recipeId}`);
      } else if (result.success && result.jobId) {
        // Async import — redirect to a polling page, passing the source URL so
        // the poller can show context-specific messages (e.g. for Instagram reels).
        const importPath = `/recipes/import/${result.jobId}?url=${encodeURIComponent(url)}`;
        router.push(importPath);
      } else if (result.siteBlocked) {
        setSiteBlocked(true);
        setError(result.error || "This website doesn't allow automated import.");
      } else {
        setError(result.error || "Failed to import recipe");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-800/80 sm:p-10">
      <h1 className="mb-6 font-serif text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Add Recipe
      </h1>

      {/* Mode Toggle */}
      <div className="mb-6 flex rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-800">
        <button
          type="button"
          onClick={() => switchMode("url")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === "url"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
          }`}
        >
          Import from URL
        </button>
        <button
          type="button"
          onClick={() => switchMode("text")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === "text"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
          }`}
        >
          Paste Recipe Text
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "url" ? (
          <div>
            <label
              htmlFor="url"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Recipe URL
            </label>
            <input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/recipe..."
              required
              className="w-full rounded-xl border border-zinc-300/80 bg-white/80 px-4 py-3 text-base text-zinc-900 placeholder-zinc-400 shadow-sm backdrop-blur-sm transition-all focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/10 dark:border-zinc-700/80 dark:bg-zinc-800/60 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:bg-zinc-800"
            />
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              Paste the full URL of a recipe page. We&apos;ll extract and format it automatically.
            </p>
          </div>
        ) : (
          <>
            <div>
              <label
                htmlFor="text"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Recipe Text
              </label>
              <textarea
                id="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the recipe text here..."
                required
                rows={12}
                className="w-full rounded-xl border border-zinc-300/80 bg-white/80 px-4 py-3 text-base text-zinc-900 placeholder-zinc-400 shadow-sm backdrop-blur-sm transition-all focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/10 dark:border-zinc-700/80 dark:bg-zinc-800/60 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:bg-zinc-800"
              />
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                If the URL import doesn&apos;t work, paste the recipe content directly.
              </p>
            </div>
            <div>
              <label
                htmlFor="textSourceUrl"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Source URL (optional)
              </label>
              <input
                id="textSourceUrl"
                type="url"
                value={textSourceUrl}
                onChange={(e) => setTextSourceUrl(e.target.value)}
                placeholder="https://example.com/recipe..."
                className="w-full rounded-xl border border-zinc-300/80 bg-white/80 px-4 py-3 text-base text-zinc-900 placeholder-zinc-400 shadow-sm backdrop-blur-sm transition-all focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/10 dark:border-zinc-700/80 dark:bg-zinc-800/60 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:bg-zinc-800"
              />
            </div>

            {/* Image picker */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Image (optional)
              </label>

              {previewUrl && (
                <div className="mb-3 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Recipe preview"
                    className="w-full object-cover"
                    style={{ maxHeight: "200px" }}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z" />
                    <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                  </svg>
                  {previewUrl ? "Replace Image" : "Choose Image"}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={IMAGE_INPUT_ACCEPT}
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>

                {previewUrl && (
                  <button
                    type="button"
                    onClick={handleCancelImage}
                    className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    Remove
                  </button>
                )}
              </div>

              {imageMessage && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{imageMessage}</p>
              )}
              <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                {IMAGE_ACCEPT_LABEL}
              </p>
            </div>
          </>
        )}

        {error && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              siteBlocked
                ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            }`}
          >
            <p>{error}</p>
            {siteBlocked && mode === "url" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={switchToTextWithUrl}
                  className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                  >
                    <path
                      fillRule="evenodd"
                      d="M15.621 4.379a3 3 0 0 0-4.242 0l-7 7a3 3 0 0 0 4.241 4.243h.001l.497-.5a.75.75 0 0 1 1.064 1.057l-.498.501-.002.002a4.5 4.5 0 0 1-6.364-6.364l7-7a4.5 4.5 0 0 1 6.368 6.36l-3.455 3.553A2.625 2.625 0 1 1 9.52 9.52l3.45-3.451a.75.75 0 1 1 1.061 1.06l-3.45 3.451a1.125 1.125 0 0 0 1.587 1.595l3.454-3.553a3 3 0 0 0 0-4.242Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Switch to paste text (URL saved)
                </button>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z"
                      clipRule="evenodd"
                    />
                    <path
                      fillRule="evenodd"
                      d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Open page in new tab
                </a>
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              {progressMessage}
            </span>
          ) : (
            "Import Recipe"
          )}
        </button>
      </form>
    </div>
  );
}
