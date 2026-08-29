/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output (Phase 14, docs/DECISIONS.md D20): pnpm's default node_modules
  // layout is symlink-based, pointing back up to a root-level `.pnpm` store — a Docker
  // image's final stage that only copies `apps/web/node_modules` (per the pre-Phase-14
  // Dockerfile.web) would ship dangling symlinks with nothing on the other end, since the
  // root store never got copied. `output: "standalone"` makes Next.js trace and bundle
  // only the actual runtime dependencies it needs into a self-contained
  // `.next/standalone` folder, which is what the Dockerfile now copies instead.
  output: "standalone",
};

module.exports = nextConfig;
