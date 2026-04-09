import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const MEDIA_DIR = process.env.MEDIA_DIR || "public/media";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

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
      return null;
    }

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RecipesRepo/1.0; +https://github.com/recipes-repo)",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.error(`Failed to download image: ${response.status}`);
      return null;
    }

    // Validate content type
    const contentType = response.headers.get("content-type") || "";
    const mimeType = contentType.split(";")[0].trim().toLowerCase();

    if (!ALLOWED_TYPES.includes(mimeType)) {
      console.error(`Unsupported image type: ${mimeType}`);
      return null;
    }

    // Validate content length
    const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_SIZE) {
      console.error(`Image too large: ${contentLength} bytes`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Double-check actual size
    if (buffer.length > MAX_SIZE) {
      console.error(`Image too large after download: ${buffer.length} bytes`);
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

    return publicPath;
  } catch (error) {
    console.error("Failed to download image:", error);
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
    if (!ALLOWED_TYPES.includes(file.type)) {
      console.error(`Unsupported image type: ${file.type}`);
      return null;
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      console.error(`Image too large: ${file.size} bytes`);
      return null;
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Double-check actual size
    if (buffer.length > MAX_SIZE) {
      console.error(`Image too large after reading: ${buffer.length} bytes`);
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

    return publicPath;
  } catch (error) {
    console.error("Failed to save uploaded image:", error);
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
      console.error("Attempted path traversal in deleteImage");
      return;
    }

    await fs.unlink(filePath);
  } catch (error) {
    console.error("Failed to delete image:", error);
  }
}
