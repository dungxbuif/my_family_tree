import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
