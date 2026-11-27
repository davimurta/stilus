import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets the e2e suite build the site twice (API up / API down) side by side.
  distDir: process.env.EXAMPLE_SITE_DIST_DIR ?? ".next",
};

export default nextConfig;
