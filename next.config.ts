import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Geliştirme modunda köşede çıkan Next.js dev göstergesini gizle.
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
