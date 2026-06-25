import { NextResponse } from "next/server";

// Metin adresi → koordinat geocode PROXY'si (OpenStreetMap Nominatim).
// Sunucu tarafı, çünkü Nominatim tarayıcıya CORS izni vermiyor (istemciden doğrudan
// çağrı bloklanır). Yalnızca havuz HARİTA SEÇİM ekranında pinsizleri yaklaşık
// göstermek için; kesin pin/navigasyon değil. Sonuç bir gün cache'lenir.

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "TakeAwaySystem/1.0 (paket servis kurye seçim haritası)";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return NextResponse.json(null);

  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "tr",
    q,
  });

  // near=lat,lng → sonuç bu noktanın ~25 km çevresine önceliklenir (yanlış şehri eler).
  const near = searchParams.get("near");
  if (near) {
    const [lat, lng] = near.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const d = 0.22;
      params.set("viewbox", `${lng - d},${lat - d},${lng + d},${lat + d}`);
    }
  }

  try {
    const res = await fetch(`${NOMINATIM}?${params.toString()}`, {
      headers: { "User-Agent": UA, "Accept-Language": "tr" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return NextResponse.json(null);
    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length === 0) return NextResponse.json(null);
    const hit = data[0] as { lat?: string; lon?: string };
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(null);
    }
    return NextResponse.json({ lat, lng });
  } catch {
    return NextResponse.json(null);
  }
}
