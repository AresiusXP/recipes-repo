/**
 * Media proxy route — forwards /media/{filename} to the Go backend's
 * /api/media/{filename} endpoint. This is needed because all traffic enters
 * via the frontend ingress, so the browser cannot reach the backend directly.
 * Images are stored with imagePath = "/media/{filename}" in the DB, and the
 * browser resolves that against the app origin (recipes.aresius.xyz).
 */

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
): Promise<Response> {
  const { filename } = await params;

  // Security: reject path traversal attempts.
  if (filename.includes("/") || filename.includes("..")) {
    return new Response("invalid filename", { status: 400 });
  }

  const upstream = `${BACKEND_URL}/api/media/${encodeURIComponent(filename)}`;

  const res = await fetch(upstream, { cache: "no-store" });

  if (!res.ok) {
    return new Response("not found", { status: res.status });
  }

  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const body = await res.arrayBuffer();

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Cache images in the browser for 1 day; CDN/proxy for 1 hour.
      "Cache-Control": "public, max-age=86400, s-maxage=3600",
    },
  });
}
