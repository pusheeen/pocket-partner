import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  outputFileTracingIncludes: {
    "/api/chat": ["./src/data/**/*"],
  },
};

export default nextConfig;
