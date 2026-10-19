import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
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
