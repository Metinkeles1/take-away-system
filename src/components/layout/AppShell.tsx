"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import AppSidebar from "./AppSidebar";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { VisuallyHidden } from "radix-ui";
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Sayfa değişince Sheet'i kapat
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="h-full flex">
      {/* Desktop sidebar — lg ve üzeri */}
      <div className="hidden lg:flex h-full">
        <AppSidebar variant="desktop" />
      </div>

      {/* İçerik kolonu */}
      <div className="flex-1 min-w-0 flex flex-col h-full">
        {/* Mobil top bar — yalnızca lg altı */}
        <header className="lg:hidden shrink-0 z-40 h-12 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Menüyü aç">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-56 bg-slate-900 border-r-0 [&>button]:text-white">
              <VisuallyHidden.Root>
                <SheetTitle>Navigasyon</SheetTitle>
              </VisuallyHidden.Root>
              <AppSidebar variant="mobile" onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="font-bold text-base flex items-center gap-1.5">
            <span className="text-xl">🛵</span>
            <span>PaketSipariş</span>
          </span>
        </header>

        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
