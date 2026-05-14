import { getToken } from "next-auth/jwt";
import { SignJWT } from "jose";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  // Decode the JWE session cookie. secureCookie: true ensures the HKDF salt
  // matches the __Secure- prefixed cookie name used on HTTPS.
  const rawToken = await getToken({
    req,
    secret: process.env.AUTH_SECRET!,
    secureCookie: true,
  });

  if (!rawToken?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Re-sign the decoded payload as a plain HS256 JWS that the Go backend can verify.
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const { iat, exp, jti, ...payload } = rawToken;
  const jws = await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(iat)
    .setExpirationTime(exp ?? Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60)
    .setJti(jti ?? crypto.randomUUID())
    .sign(secret);

  const { jobId } = await params;

  const res = await fetch(`${BACKEND_URL}/api/recipes/import/${jobId}`, {
    headers: {
      Authorization: `Bearer ${jws}`,
    },
    cache: "no-store",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
