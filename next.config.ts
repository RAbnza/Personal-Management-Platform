import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  distDir: process.env.NODE_ENV === "production" ? ".next-release" : ".next",
};

export default nextConfig;
