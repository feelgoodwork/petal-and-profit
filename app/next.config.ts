import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/sdk"],
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    return [
      { source: '/pilot', destination: '/landing.html' },
      { source: '/full-sales', destination: '/full-sales.html' },
    ];
  },
};

export default nextConfig;
