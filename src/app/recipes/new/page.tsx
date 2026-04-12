"use client";

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

export default function NewRecipePage() {
  const router = useRouter();
  const [mode, setMode] = useState<ImportMode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [textSourceUrl, setTextSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Image picker state (text mode only)
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageMessage, setImageMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    try {
      const result =
        mode === "url"
          ? await importRecipeFromUrl(url)
          : await importRecipeFromText(text, textSourceUrl || undefined, imageFile ?? null);

      if (result.success && result.recipeId) {
        router.push(`/recipes/${result.recipeId}`);
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
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 font-serif text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Add Recipe
      </h1>

      {/* Mode Toggle */}
      <div className="mb-6 flex rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900">
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
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500"
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
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500"
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
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500"
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
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
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
              Processing with AI...
            </span>
          ) : (
            "Import Recipe"
          )}
        </button>
      </form>
    </div>
  );
}
