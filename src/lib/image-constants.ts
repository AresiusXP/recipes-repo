/**
 * Shared image upload constraints used by both server-side validation
 * (image-storage.ts) and client-side input hints (RecipeEditForm, SettingsForm, etc.).
 *
 * This file must not import any server-only modules so it can safely be used
 * in "use client" components.
 */

export const IMAGE_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type AllowedImageType = (typeof IMAGE_ALLOWED_TYPES)[number];

/** Maximum upload size in bytes (10 MB). */
export const IMAGE_MAX_SIZE = 10 * 1024 * 1024;

/** Human-readable description of accepted formats. */
export const IMAGE_ACCEPT_LABEL = "JPEG, PNG, WebP, or GIF. Max 10MB.";

/** Value for the `accept` attribute on file inputs. */
export const IMAGE_INPUT_ACCEPT = IMAGE_ALLOWED_TYPES.join(",");
