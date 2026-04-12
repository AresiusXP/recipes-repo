import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { logger, serializeError } from "@/lib/logger";
import { IMAGE_ALLOWED_TYPES, IMAGE_MAX_SIZE } from "@/lib/image-constants";

const MEDIA_DIR = process.env.MEDIA_DIR || "public/media";

const log = logger.child({ component: "image-storage" });

/**
 * Downloads an image from a URL and saves it locally.
 * Returns the public path (relative to /public) for serving.
 */
export async function downloadImage(imageUrl: string): Promise<string | null> {
  try {
    // Resolve relative URLs
    const url = new URL(imageUrl);

    // Only allow http(s)
    if (!["http:", "https:"].includes(url.protocol)) {
      log.warn({ imageUrl, protocol: url.protocol }, "Image download rejected: unsupported protocol");
      return null;
    }

    log.debug({ imageUrl }, "Downloading image");

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RecipesRepo/1.0; +https://github.com/recipes-repo)",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      log.warn({ imageUrl, status: response.status }, "Image download returned non-OK status");
      return null;
    }

    // Validate content type
    const contentType = response.headers.get("content-type") || "";
    const mimeType = contentType.split(";")[0].trim().toLowerCase();

    if (!IMAGE_ALLOWED_TYPES.includes(mimeType as typeof IMAGE_ALLOWED_TYPES[number])) {
      log.warn({ imageUrl, mimeType }, "Image download rejected: unsupported MIME type");
      return null;
    }

    // Validate content length
    const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
    if (contentLength > IMAGE_MAX_SIZE) {
      log.warn({ imageUrl, contentLength, maxSize: IMAGE_MAX_SIZE }, "Image download rejected: content-length exceeds limit");
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Double-check actual size
    if (buffer.length > IMAGE_MAX_SIZE) {
      log.warn({ imageUrl, actualSize: buffer.length, maxSize: IMAGE_MAX_SIZE }, "Image download rejected: actual size exceeds limit");
      return null;
    }

    // Determine file extension
    const extMap: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
    };
    const ext = extMap[mimeType] || ".jpg";

    // Generate unique filename
    const filename = `${uuidv4()}${ext}`;

    // Ensure media directory exists
    const cwd = /* turbopackIgnore: true */ process.cwd();
    const absoluteMediaDir = path.resolve(cwd, MEDIA_DIR);
    await fs.mkdir(absoluteMediaDir, { recursive: true });

    // Write file
    const filePath = path.join(absoluteMediaDir, filename);
    await fs.writeFile(filePath, buffer);

    // Return public-accessible path
    // If MEDIA_DIR starts with "public/", strip "public" prefix for the URL
    const publicPath = MEDIA_DIR.startsWith("public/")
      ? `/${MEDIA_DIR.slice("public/".length)}/${filename}`
      : `/media/${filename}`;

    log.info({ imageUrl, publicPath, size: buffer.length, mimeType }, "Image downloaded and saved successfully");

    return publicPath;
  } catch (error) {
    log.error({ imageUrl, err: serializeError(error) }, "Failed to download image");
    return null;
  }
}

/**
 * Saves an uploaded File to the media directory.
 * Returns the public path for serving, or null on failure.
 */
export async function saveUploadedImage(file: File): Promise<string | null> {
  try {
    // Validate MIME type
    if (!IMAGE_ALLOWED_TYPES.includes(file.type as typeof IMAGE_ALLOWED_TYPES[number])) {
      log.warn({ fileType: file.type }, "Uploaded image rejected: unsupported MIME type");
      return null;
    }

    // Validate size
    if (file.size > IMAGE_MAX_SIZE) {
      log.warn({ fileSize: file.size, maxSize: IMAGE_MAX_SIZE }, "Uploaded image rejected: file size exceeds limit");
      return null;
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Double-check actual size
    if (buffer.length > IMAGE_MAX_SIZE) {
      log.warn({ actualSize: buffer.length, maxSize: IMAGE_MAX_SIZE }, "Uploaded image rejected: actual buffer size exceeds limit");
      return null;
    }

    // Determine file extension
    const extMap: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
    };
    const ext = extMap[file.type] || ".jpg";

    // Generate unique filename
    const filename = `${uuidv4()}${ext}`;

    // Ensure media directory exists
    const cwd = /* turbopackIgnore: true */ process.cwd();
    const absoluteMediaDir = path.resolve(cwd, MEDIA_DIR);
    await fs.mkdir(absoluteMediaDir, { recursive: true });

    // Write file
    const filePath = path.join(absoluteMediaDir, filename);
    await fs.writeFile(filePath, buffer);

    // Return public-accessible path
    const publicPath = MEDIA_DIR.startsWith("public/")
      ? `/${MEDIA_DIR.slice("public/".length)}/${filename}`
      : `/media/${filename}`;

    log.info({ publicPath, size: buffer.length, mimeType: file.type }, "Uploaded image saved successfully");

    return publicPath;
  } catch (error) {
    log.error({ err: serializeError(error) }, "Failed to save uploaded image");
    return null;
  }
}

/**
 * Check whether a path is a locally managed media file (as opposed to an external URL).
 * Derives the expected prefix from MEDIA_DIR so it stays correct even if the
 * environment variable is changed from the default "public/media".
 */
export function isLocalMediaPath(imagePath: string): boolean {
  const prefix = MEDIA_DIR.startsWith("public/")
    ? `/${MEDIA_DIR.slice("public/".length)}/`
    : "/media/";
  return imagePath.startsWith(prefix);
}

/**
 * Delete a locally stored image by its public path.
 */
export async function deleteImage(publicPath: string): Promise<void> {
  try {
    const filename = path.basename(publicPath);
    const cwd = /* turbopackIgnore: true */ process.cwd();
    const absoluteMediaDir = path.resolve(cwd, MEDIA_DIR);
    const filePath = path.join(absoluteMediaDir, filename);

    // Security: ensure the resolved path is inside the media directory
    if (!filePath.startsWith(absoluteMediaDir)) {
      log.error({ publicPath, filePath }, "Attempted path traversal in deleteImage — request blocked");
      return;
    }

    await fs.unlink(filePath);
    log.debug({ publicPath }, "Image file deleted");
  } catch (error) {
    log.error({ publicPath, err: serializeError(error) }, "Failed to delete image file");
  }
}

/**
 * Duplicates a locally stored image file and returns the new public path.
 * Returns null if the source path is not a local media file or copy fails.
 */
export async function duplicateImage(publicPath: string): Promise<string | null> {
  try {
    if (!isLocalMediaPath(publicPath)) {
      // Not a local file; just reuse the path (e.g. external URL stored as-is)
      return publicPath;
    }

    const srcFilename = path.basename(publicPath);
    const ext = path.extname(srcFilename);
    const newFilename = `${uuidv4()}${ext}`;

    const cwd = /* turbopackIgnore: true */ process.cwd();
    const absoluteMediaDir = path.resolve(cwd, MEDIA_DIR);
    const srcFilePath = path.join(absoluteMediaDir, srcFilename);
    const destFilePath = path.join(absoluteMediaDir, newFilename);

    // Security: ensure both paths are inside the media directory
    if (!srcFilePath.startsWith(absoluteMediaDir) || !destFilePath.startsWith(absoluteMediaDir)) {
      log.error({ publicPath }, "Attempted path traversal in duplicateImage — request blocked");
      return null;
    }

    await fs.mkdir(absoluteMediaDir, { recursive: true });
    await fs.copyFile(srcFilePath, destFilePath);

    const newPublicPath = MEDIA_DIR.startsWith("public/")
      ? `/${MEDIA_DIR.slice("public/".length)}/${newFilename}`
      : `/media/${newFilename}`;

    log.info({ srcPublicPath: publicPath, newPublicPath }, "Image duplicated successfully");
    return newPublicPath;
  } catch (error) {
    log.error({ publicPath, err: serializeError(error) }, "Failed to duplicate image");
    return null;
  }
}
