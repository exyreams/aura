import path from "node:path";
import type { NextConfig } from "next";

const backendUrl =
  process.env.AURA_BACKEND_URL ??
  process.env.NEXT_PUBLIC_AURA_BACKEND_URL ??
  "http://localhost:8787";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, "..", ".."),
  },
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
