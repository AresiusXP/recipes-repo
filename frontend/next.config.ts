import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Static CSP header (no nonces). 'unsafe-inline' is required for Next.js
// inline scripts/styles. 'unsafe-eval' is only added in development because
// React uses eval() for enhanced error stack reconstruction in dev mode.
//
// img-src includes OAuth provider avatar domains:
//   - lh3.googleusercontent.com  — Google profile pictures
//   - *.googleusercontent.com    — broader Google CDN (covers future subdomains)
//   - graph.microsoft.com        — Microsoft Graph API profile photos
//   - *.microsoft.com            — Microsoft CDN (covers Entra ID avatars)
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: *.googleusercontent.com *.microsoft.com graph.microsoft.com;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  connect-src 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
  output: "standalone",
  // Cache Components (Next.js 16): uses React <Activity> to preserve page DOM +
  // scroll position on client-side back/forward navigation instead of
  // unmounting and re-rendering. Fixes scroll-reset-on-back for the recipe list.
  cacheComponents: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      {
        // Apply to all routes
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
