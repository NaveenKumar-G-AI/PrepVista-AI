/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Linting is handled separately in CI; do not block local builds on it.
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
