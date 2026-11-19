import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/openapi.json", destination: "/openapi.json" }];
  },
  images: {
    // Optimized derivatives are public. Family media goes directly through
    // the authenticated storage route on every read.
    localPatterns: [
      { pathname: "/icon.png" },
      { pathname: "/avatar/**" },
      { pathname: "/heritage/**" },
      { pathname: "/_next/static/media/**" },
    ],
  },
};

export default nextConfig;
