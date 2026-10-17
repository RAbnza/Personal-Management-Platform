import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Keep manual UI reviews clear; compile/runtime errors remain available.
  devIndicators: false,
  distDir: process.env.NODE_ENV === "production" ? ".next-release" : ".next",
};

export default nextConfig;
