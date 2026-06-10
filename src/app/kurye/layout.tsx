import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Kurye · Teslimat",
  description: "Kurye teslimat ekranı",
  // Kuryeye özel manifest → /kurye'den "Uygulamayı yükle" denince ana panel değil,
  // yalnızca kurye uygulaması (açılışta direkt /kurye) kurulur. Kök manifest'i override eder.
  manifest: "/kurye.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Kurye",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/kurye-apple-touch.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f172a",
};

export default function KuryeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
