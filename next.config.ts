import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  // Headless-browser deps for share-link rendering; must load via native require.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  experimental: {
    strictRouteTypes: false,
    // Persistent dev cache grew past 1 GB and its compaction exhausted the
    // Windows paging file (os error 1455). Trade slower cold starts for stability.
    turbopackFileSystemCacheForDev: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
