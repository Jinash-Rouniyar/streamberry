/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @consumet/extensions depends on got-scraping, which ships an "exports"
  // field webpack cannot bundle. Keep it external so it's required at runtime
  // in the Node.js serverless function instead of being bundled.
  experimental: {
    serverComponentsExternalPackages: ["@consumet/extensions", "got-scraping"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
    ],
  },
};

export default nextConfig;
