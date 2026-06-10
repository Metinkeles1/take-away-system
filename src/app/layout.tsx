import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "@/components/layout/AppShell";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Paket Sipariş Sistemi",
  description: "Telefon siparişi takip ve yönetim sistemi",
  // manifest.ts otomatik <link rel="manifest"> ekler; apple-touch-icon ve iOS
  // standalone meta'larını burada belirtiyoruz (iOS manifest'i tam desteklemez).
  appleWebApp: {
    capable: true,
    title: "Paket Sipariş",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/icon-apple-touch.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} font-sans antialiased h-dvh flex flex-col overflow-hidden`}
      >
        <AppShell>{children}</AppShell>
        <Toaster richColors position="top-right" />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
