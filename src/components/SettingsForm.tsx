"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  updateUserSettings,
  uploadProfileImage,
  removeProfileImage,
  type UserSettings,
} from "@/app/actions/user";

interface SettingsFormProps {
  initialSettings: UserSettings;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialSettings.name || "");
  const [translateRecipes, setTranslateRecipes] = useState(initialSettings.translateRecipes);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Avatar state
  const [currentImage, setCurrentImage] = useState<string | null>(initialSettings.image);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URL to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const trimmedName = name.trim();
  const initials = trimmedName
    ? trimmedName
        .split(/\s+/)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      setAvatarMessage({ type: "error", text: "Please select a JPEG, PNG, WebP, or GIF image." });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setAvatarMessage({ type: "error", text: "Image must be under 10MB." });
      return;
    }

    // Create preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setAvatarMessage(null);
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setAvatarMessage(null);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const result = await uploadProfileImage(formData);

      if (result.success && result.image) {
        setCurrentImage(result.image);
        setPreviewUrl(null);
        setAvatarMessage({ type: "success", text: "Profile picture updated" });
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        router.refresh();
      } else {
        setAvatarMessage({ type: "error", text: result.error || "Failed to upload image" });
      }
    } catch (err) {
      setAvatarMessage({
        type: "error",
        text: err instanceof Error ? err.message : "An unexpected error occurred",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveImage() {
    setUploading(true);
    setAvatarMessage(null);

    try {
      const result = await removeProfileImage();

      if (result.success) {
        setCurrentImage(null);
        setPreviewUrl(null);
        setAvatarMessage({ type: "success", text: "Profile picture removed" });
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        router.refresh();
      } else {
        setAvatarMessage({ type: "error", text: result.error || "Failed to remove image" });
      }
    } catch (err) {
      setAvatarMessage({
        type: "error",
        text: err instanceof Error ? err.message : "An unexpected error occurred",
      });
    } finally {
      setUploading(false);
    }
  }

  function handleCancelPreview() {
    setPreviewUrl(null);
    setAvatarMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // The displayed image is the preview (if selecting a new file) or the current saved image
  const displayImage = previewUrl || currentImage;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const result = await updateUserSettings({
        name,
        translateRecipes,
      });

      if (result.success) {
        setMessage({ type: "success", text: "Settings saved successfully" });
        router.refresh();
      } else {
        setMessage({ type: "error", text: result.error || "Failed to save settings" });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "An unexpected error occurred",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Profile Picture Section */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Profile Picture
        </h2>

        <div className="flex items-center gap-6">
          {/* Avatar preview */}
          <div className="relative h-20 w-20 shrink-0">
            {displayImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayImage}
                alt="Profile picture"
                className="h-20 w-20 rounded-full object-cover ring-2 ring-zinc-200 dark:ring-zinc-700"
              />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-xl font-semibold text-white ring-2 ring-zinc-200 dark:ring-zinc-700">
                {initials}
              </span>
            )}
          </div>

          {/* Upload controls */}
          <div className="flex flex-col gap-3">
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
                Choose Image
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>

              {previewUrl && (
                <>
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploading ? "Uploading..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelPreview}
                    disabled={uploading}
                    className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </>
              )}

              {!previewUrl && currentImage && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                >
                  {uploading ? "Removing..." : "Remove"}
                </button>
              )}
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              JPEG, PNG, WebP, or GIF. Max 10MB.
            </p>
          </div>
        </div>

        {/* Avatar status message */}
        {avatarMessage && (
          <div
            className={`mt-4 rounded-lg border p-3 text-sm ${
              avatarMessage.type === "success"
                ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            }`}
          >
            {avatarMessage.text}
          </div>
        )}
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label
            htmlFor="name"
            className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Display Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500"
          />
        </div>

        {/* Translate Recipes Toggle */}
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="space-y-1">
            <label
              htmlFor="translateRecipes"
              className="text-sm font-medium text-zinc-900 dark:text-zinc-50"
            >
              Translate recipes to English
            </label>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              When enabled, imported recipes will be automatically translated to English.
              Tags are always in English regardless of this setting.
            </p>
          </div>
          <button
            id="translateRecipes"
            type="button"
            role="switch"
            aria-checked={translateRecipes}
            onClick={() => setTranslateRecipes(!translateRecipes)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 ${
              translateRecipes ? "bg-primary" : "bg-zinc-300 dark:bg-zinc-600"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                translateRecipes ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Status Message */}
        {message && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              message.type === "success"
                ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
