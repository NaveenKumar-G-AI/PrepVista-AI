import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          ...(isProduction ? [{
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "form-action 'self' https://api.razorpay.com",
              "frame-ancestors 'self'",
              "object-src 'none'",
              "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
              "img-src 'self' data: blob: https:",
              "media-src 'self' blob:",
              "connect-src 'self' https: wss:",
              "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
              "worker-src 'self' blob:",
              "upgrade-insecure-requests",
            ].join("; "),
          }] : []),
        ],
      },
      {
        // A worker uses its own response policy. WASM is enabled only on this
        // asset; interview page CSP and microphone permission stay unchanged.
        source: "/coding-assets/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'none'; worker-src 'none'; object-src 'none'" },
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
