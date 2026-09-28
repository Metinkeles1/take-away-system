import { Suspense } from "react";

import { KomutaShell } from "@/components/dashboard/komuta/KomutaShell";

// Komuta Merkezi: Genel Bakış (/komuta), Performans, Müşteri — sidebar alt
// menüsünden açılır; başlık + filtreler bu ortak çerçevede.
export default function KomutaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full">
      <Suspense>
        <KomutaShell>{children}</KomutaShell>
      </Suspense>
    </div>
  );
}
