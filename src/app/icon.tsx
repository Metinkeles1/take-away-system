import { ImageResponse } from "next/og";

// Tarayıcı sekmesinde görünen favicon. Panelin emerald temasıyla uyumlu,
// içinde beyaz bir alışveriş çantası (lucide ShoppingBag) — paket servisi temsil eder.
// Next.js bu dosyayı otomatik favicon olarak kullanır; src/app/favicon.ico'ya gerek yok.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// lucide-react "shopping-bag" ikonunun path'leri (beyaz çizgi olarak çizilir).
const bag = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Emerald gradient — panelin bg-emerald-600 tonuyla aynı aile.
          background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
          borderRadius: 7,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          width={20}
          height={20}
          src={`data:image/svg+xml;base64,${Buffer.from(bag).toString("base64")}`}
          alt=""
        />
      </div>
    ),
    { ...size }
  );
}
