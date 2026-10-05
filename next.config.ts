import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Geliştirme modunda köşede çıkan Next.js dev göstergesini gizle.
  devIndicators: false,
  experimental: {
    // Ürün resmi sunucu eylemiyle yüklenir; varsayılan 1 MB sınırı telefon
    // fotoğraflarını reddediyordu. Resim zaten tarayıcıda küçültülüyor; bu,
    // küçültülemeyen dosyalar için pay. Vercel'in kendi sınırı 4.5 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
  images: {
    // 75 varsayılan; ürün fotoğrafları 85 ile basılır (doku korunsun)
    qualities: [75, 85],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
