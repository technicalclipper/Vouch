import type { NextConfig } from "next";
import path from "node:path";

// We import `shared/config.ts` from the repo root (CLAUDE.md §8 single-source
// rule). Next's bundler doesn't follow files outside the app dir by default,
// so we expand its root + alias `@shared/*` explicitly.
const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, ".."),
    resolveAlias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@shared": path.resolve(__dirname, "../shared"),
    };
    return config;
  },
};

export default nextConfig;
