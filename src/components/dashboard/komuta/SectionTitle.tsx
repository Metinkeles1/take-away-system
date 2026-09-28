// Komuta sayfalarında bölüm ayırıcı: küçük başlık + ince çizgi.
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-center gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
