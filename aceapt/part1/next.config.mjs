/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Linting is intentionally not wired into the build for this prototype.
    // See README "Known limitations" — add `next lint` config before shipping to production.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
