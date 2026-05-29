import { NextRequest, NextResponse } from "next/server";
import { getProducts, getAvailableProducts } from "@/actions/products";

// Bu uç nokta başka projelerin ürünlere (resimleriyle) erişmesi için açıldı.
// Herkese açık; tarayıcıdan da sunucudan da çağrılabilsin diye CORS serbest.
// Veriler canlı MongoDB'den okunur, cache'lenmez.
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Yerel resim yolları ("/images/products/x.jpg") bu projenin domain'ine
// göreceli — başka projede çalışması için başına tam origin eklenir.
// Blob/data/http URL'leri zaten mutlak, oldukları gibi bırakılır.
function absolutizeImage(image: string | undefined, origin: string): string | undefined {
  if (!image) return undefined;
  if (image.startsWith("/")) return origin + image;
  return image;
}

export async function GET(req: NextRequest) {
  try {
    const onlyAvailable = req.nextUrl.searchParams.get("available") === "true";
    const products = onlyAvailable
      ? await getAvailableProducts()
      : await getProducts();

    const origin = req.nextUrl.origin;
    const data = products.map((p) => ({
      ...p,
      image: absolutizeImage(p.image, origin),
    }));

    return NextResponse.json(data, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("[GET /api/products]", err);
    return NextResponse.json(
      { error: "Ürünler getirilemedi" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

// CORS preflight (tarayıcıdan cross-origin çağrılar için)
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
