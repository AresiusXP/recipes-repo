"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateRecipe, type RecipeFormData } from "@/app/actions/recipes";
import {
  IMAGE_ALLOWED_TYPES,
  IMAGE_MAX_SIZE,
  IMAGE_ACCEPT_LABEL,
  IMAGE_INPUT_ACCEPT,
} from "@/lib/image-constants";

interface RecipeEditFormProps {
  recipeId: string;
  initialData: RecipeFormData;
  initialImagePath?: string | null;
}

export function RecipeEditForm({ recipeId, initialData, initialImagePath }: RecipeEditFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialData.title);
  const [description, setDescription] = useState(initialData.description);
  const [ingredients, setIngredients] = useState<string[]>(initialData.ingredients);
  const [steps, setSteps] = useState<string[]>(initialData.steps);
  const [tagInput, setTagInput] = useState(initialData.tags.join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Image state
  const [currentImagePath, setCurrentImagePath] = useState<string | null>(initialImagePath ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageMessage, setImageMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke preview object URL to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

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

    const objectUrl = URL.createObjectURL(file);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(objectUrl);
    setImageFile(file);
    setImageMessage(null);
  }

  function handleCancelImageSelection() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setImageFile(null);
    setImageMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleRemoveCurrentImage() {
    setCurrentImagePath(null);
    handleCancelImageSelection();
  }

  function addIngredient() {
    setIngredients([...ingredients, ""]);
  }

  function removeIngredient(index: number) {
    setIngredients(ingredients.filter((_, i) => i !== index));
  }

  function updateIngredient(index: number, value: string) {
    const updated = [...ingredients];
    updated[index] = value;
    setIngredients(updated);
  }

  function addStep() {
    setSteps([...steps, ""]);
  }

  function removeStep(index: number) {
    setSteps(steps.filter((_, i) => i !== index));
  }

  function updateStep(index: number, value: string) {
    const updated = [...steps];
    updated[index] = value;
    setSteps(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const tags = tagInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const data: RecipeFormData = {
      title,
      description,
      ingredients: ingredients.filter(Boolean),
      steps: steps.filter(Boolean),
      tags,
    };

    // Determine image action
    let imageAction: "keep" | "replace" | "remove" = "keep";
    if (imageFile) {
      imageAction = "replace";
    } else if (!currentImagePath && initialImagePath) {
      // User removed the existing image without selecting a new one
      imageAction = "remove";
    }

    try {
      const result = await updateRecipe(recipeId, data, imageAction, imageFile ?? undefined);
      if (result.success) {
        router.push(`/recipes/${recipeId}`);
      } else {
        setError(result.error || "Failed to update recipe");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  }

  // The image shown in the preview area
  const displayImage = previewUrl ?? currentImagePath;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Title */}
      <div>
        <label
          htmlFor="title"
          className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full rounded-xl border border-zinc-300/80 bg-white/80 px-4 py-3 text-base text-zinc-900 shadow-sm transition-all focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/10 dark:border-zinc-700/80 dark:bg-zinc-800/60 dark:text-zinc-50 dark:focus:bg-zinc-800 sm:backdrop-blur-sm"
        />
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="description"
          className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-zinc-300/80 bg-white/80 px-4 py-3 text-base text-zinc-900 shadow-sm transition-all focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/10 dark:border-zinc-700/80 dark:bg-zinc-800/60 dark:text-zinc-50 dark:focus:bg-zinc-800 sm:backdrop-blur-sm"
        />
      </div>

      {/* Image */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Image
        </label>

        {/* Preview */}
        {displayImage && (
          <div className="mb-3 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayImage}
              alt="Recipe preview"
              className="w-full object-cover"
              style={{ maxHeight: "240px" }}
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
            {displayImage ? "Replace Image" : "Choose Image"}
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
              onClick={handleCancelImageSelection}
              className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Cancel
            </button>
          )}

          {!previewUrl && currentImagePath && (
            <button
              type="button"
              onClick={handleRemoveCurrentImage}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              Remove Image
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

      {/* Ingredients */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Ingredients
          </label>
          <button
            type="button"
            onClick={addIngredient}
            className="text-xs font-medium text-primary hover:text-primary-dark"
          >
            + Add ingredient
          </button>
        </div>
        <div className="space-y-2">
          {ingredients.map((ingredient, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={ingredient}
                onChange={(e) => updateIngredient(i, e.target.value)}
                placeholder={`Ingredient ${i + 1}`}
                className="flex-1 rounded-xl border border-zinc-300/80 bg-white/80 px-4 py-3 text-base text-zinc-900 shadow-sm transition-all focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/10 dark:border-zinc-700/80 dark:bg-zinc-800/60 dark:text-zinc-50 dark:focus:bg-zinc-800 sm:backdrop-blur-sm"
              />
              <button
                type="button"
                onClick={() => removeIngredient(i)}
                className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Instructions
          </label>
          <button
            type="button"
            onClick={addStep}
            className="text-xs font-medium text-primary hover:text-primary-dark"
          >
            + Add instruction
          </button>
        </div>
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="flex h-8 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <textarea
                value={step}
                onChange={(e) => updateStep(i, e.target.value)}
                placeholder={`Step ${i + 1}`}
                rows={2}
                className="flex-1 rounded-xl border border-zinc-300/80 bg-white/80 px-4 py-3 text-base text-zinc-900 shadow-sm transition-all focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/10 dark:border-zinc-700/80 dark:bg-zinc-800/60 dark:text-zinc-50 dark:focus:bg-zinc-800 sm:backdrop-blur-sm"
              />
              <button
                type="button"
                onClick={() => removeStep(i)}
                className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div>
        <label
          htmlFor="tags"
          className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Tags
        </label>
        <input
          id="tags"
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="vegetarian, quick, italian..."
          className="w-full rounded-xl border border-zinc-300/80 bg-white/80 px-4 py-3 text-base text-zinc-900 shadow-sm transition-all focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/10 dark:border-zinc-700/80 dark:bg-zinc-800/60 dark:text-zinc-50 dark:focus:bg-zinc-800 sm:backdrop-blur-sm"
        />
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          Separate tags with commas
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
