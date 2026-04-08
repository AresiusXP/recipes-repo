import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "prisma", "@prisma/adapter-libsql", "@libsql/client"],
  images: {
    // Allow Next.js to serve locally downloaded images from /media/
    localPatterns: [
      {
        pathname: "/media/**",
      },
    ],
  },
};

export default nextConfig;
