import { Loader2 } from "lucide-react";

// Global fallback loading state. Kendi loading.tsx'i olmayan tüm route'lara
// uygulanır. Asıl amacı görsellik değil: bir Suspense sınırı oluşturarak
// navigasyonun ANINDA geçmesini (interruptible olmasını) sağlamak. Böylece
// yavaş bir sayfa yüklenirken başka bir tab'a tıklanınca eski sayfada
// beklenmiyor ve yavaş sayfa sonradan bitince kullanıcıyı oraya fırlatmıyor.
export default function GlobalLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
