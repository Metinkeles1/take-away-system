import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Kurye · Teslimat",
  description: "Kurye teslimat ekranı",
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
