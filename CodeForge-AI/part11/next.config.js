/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // This project ships without a separate ESLint setup; `npm run typecheck`
    // and `npm test` are the enforced quality gates (see README).
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
