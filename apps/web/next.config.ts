import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@mnemo/contracts"],
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
      { source: "/patient/sw.js", headers: [{ key: "Service-Worker-Allowed", value: "/patient/" }] },
    ];
  },
};

export default nextConfig;
