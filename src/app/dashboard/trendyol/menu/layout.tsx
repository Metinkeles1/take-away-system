// Fiyat güncelleme sunucu eylemi Trendyol kuyruğunun sonucunu ~20 sn'ye kadar
// bekler; varsayılan fonksiyon süresine takılmasın. Sayfa "use client" olduğu
// için süre ayarı bu katmanda.
export const maxDuration = 60;

export default function TrendyolMenuLayout({ children }: { children: React.ReactNode }) {
  return children;
}
