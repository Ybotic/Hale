import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  devIndicators: false,
  transpilePackages: ["@hale/contracts"],
  async headers() {
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
      ] },
      { source: "/family/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/patient/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/login/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/signup/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/patient/sw.js", headers: [
        { key: "Service-Worker-Allowed", value: "/patient/" },
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      ] },
    ];
  },
};

export default nextConfig;
