import type { NextConfig } from "next";

// Vouch frontend uses its own local copy of the chain config at
// `app/_lib/config.ts` (kept in sync by hand with `shared/config.ts`).
// No cross-directory imports — Turbopack stays inside the project root.
const nextConfig: NextConfig = {};

export default nextConfig;
