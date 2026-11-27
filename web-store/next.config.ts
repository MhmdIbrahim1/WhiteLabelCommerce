import type { NextConfig } from "next";
import { storefrontMediaPatterns } from "./src/lib/storefront-media.ts";

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const config: NextConfig = {
  images: { remotePatterns: storefrontMediaPatterns() },
  allowedDevOrigins: ["127.0.0.1"],
  // Auth Server Function arguments include passwords and email codes.
  logging: { serverFunctions: false },
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};
export default config;
