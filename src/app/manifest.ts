import type { MetadataRoute } from "next";

// PWA manifest — telefonda "Uygulamayı yükle" ile standalone (tam ekran, kendi ikonu)
// kurulabilmesi için. Next.js bu dosyayı /manifest.webmanifest olarak servis eder ve
// <link rel="manifest"> etiketini otomatik ekler.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Paket Sipariş Sistemi",
    short_name: "Paket Sipariş",
    description: "Telefon siparişi takip ve yönetim sistemi",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#059669",
    lang: "tr",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
