import fs from "fs/promises";
import path from "path";

const MEDIA_DIR = process.env.MEDIA_DIR || "public/media";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * Serves images from the runtime media directory.
 *
 * Next.js standalone builds only serve files that existed in `public/` at
 * build time.  Images downloaded at runtime (recipe imports, avatar uploads)
 * are written *after* the server starts, so the built-in static-file serving
 * never sees them.  This route handler bridges that gap by reading from
 * MEDIA_DIR on every request.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Only allow simple filenames — no slashes, no dot-dot
  if (!filename || filename.includes("/") || filename.includes("..")) {
    return new Response("Not Found", { status: 404 });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = MIME_TYPES[ext];

  if (!contentType) {
    return new Response("Not Found", { status: 404 });
  }

  // Resolve the absolute path to the media directory
  const cwd = /* turbopackIgnore: true */ process.cwd();
  const absoluteMediaDir = path.resolve(cwd, MEDIA_DIR);
  const filePath = path.join(absoluteMediaDir, filename);

  // Security: ensure the resolved path is still inside the media directory
  if (!filePath.startsWith(absoluteMediaDir)) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const buffer = await fs.readFile(filePath);

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    // Log unexpected errors (permission issues, etc.) but not missing files
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Failed to serve media file "${filename}":`, error);
    }
    return new Response("Not Found", { status: 404 });
  }
}
