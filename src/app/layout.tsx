import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import Navbar from "@/components/layout/Navbar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Paket Sipariş Sistemi",
  description: "Telefon siparişi takip ve yönetim sistemi",
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
        <Navbar />
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">{children}</div>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
