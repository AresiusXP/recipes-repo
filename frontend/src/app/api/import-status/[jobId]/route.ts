import { auth } from "@/lib/auth";
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;

  // Read the raw encoded session cookie to forward as Bearer token.
  // The Go backend validates this JWT using the shared AUTH_SECRET.
  const sessionCookieName =
    process.env.NODE_ENV === "production"
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

  const rawCookie = req.cookies.get(sessionCookieName)?.value;

  // Verify the token is valid before forwarding
  const decoded = await getToken({
    req,
    secret: process.env.AUTH_SECRET!,
  });

  if (!decoded || !rawCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await fetch(`${BACKEND_URL}/api/recipes/import/${jobId}`, {
    headers: {
      Authorization: `Bearer ${rawCookie}`,
    },
    cache: "no-store",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
