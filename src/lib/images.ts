import { type Product, type ProductCategory } from "@/types";

/**
 * Ürün için resim yolu. Önce elle verilen `image` alanı, sonra konvansiyon yolu.
 * Yerel dosya yoksa <img onError> ile {@link fallbackProductUrl} devreye girer.
 */
export function productImage(product: Pick<Product, "id" | "image">): string {
  return product.image ?? `/images/products/${product.id}.jpg`;
}

export function categoryImage(category: ProductCategory): string {
  return `/images/categories/${category}.jpg`;
}

/**
 * Yerel ürün resmi yoksa kullanılan deterministik SVG tile.
 * Kategori temalı renkler + subtle dot pattern + ürün adının kısa harfli abrevasyonu.
 */
export function fallbackProductUrl(
  seed: string,
  category?: ProductCategory,
  name?: string,
): string {
  const palette = category ? CATEGORY_PALETTES[category] : CATEGORY_PALETTES.default;
  const initials = name ? abbreviate(name) : "•";
  return generateTileSvg({
    size: 400,
    bg: palette[hashSeed(seed) % palette.length],
    text: initials,
    fontSize: initials.length > 2 ? 110 : 150,
    fontWeight: 700,
  });
}

export function fallbackCategoryUrl(category: ProductCategory): string {
  const palette = CATEGORY_PALETTES[category] ?? CATEGORY_PALETTES.default;
  const label = CATEGORY_INITIALS[category] ?? "•";
  return generateTileSvg({
    size: 200,
    bg: palette[0],
    text: label,
    fontSize: 90,
    fontWeight: 600,
  });
}

// ─── Renk Paletleri ───────────────────────────────────────────────────────────
// Her kategori için 2-3 ton — ürünlere ID'ye göre dağıtılır, böylece tek tip değil.
type Tone = { from: string; to: string; ink: string };

const CATEGORY_PALETTES: Record<ProductCategory | "default", Tone[]> = {
  kebap: [
    { from: "#7c2d12", to: "#dc2626", ink: "#fff7ed" },
    { from: "#9a3412", to: "#ea580c", ink: "#fff7ed" },
    { from: "#991b1b", to: "#f97316", ink: "#fff7ed" },
  ],
  pide: [
    { from: "#92400e", to: "#f59e0b", ink: "#fffbeb" },
    { from: "#a16207", to: "#eab308", ink: "#fefce8" },
  ],
  lahmacun: [
    { from: "#7f1d1d", to: "#b45309", ink: "#fff7ed" },
    { from: "#92400e", to: "#dc2626", ink: "#fff7ed" },
  ],
  durum: [
    { from: "#78350f", to: "#d97706", ink: "#fffbeb" },
    { from: "#854d0e", to: "#a16207", ink: "#fefce8" },
  ],
  kilo: [
    { from: "#1f2937", to: "#525252", ink: "#f9fafb" },
    { from: "#27272a", to: "#71717a", ink: "#f9fafb" },
  ],
  corba: [
    { from: "#9a3412", to: "#fb923c", ink: "#fff7ed" },
    { from: "#7c2d12", to: "#f97316", ink: "#fff7ed" },
  ],
  tatli: [
    { from: "#9d174d", to: "#ec4899", ink: "#fdf2f8" },
    { from: "#86198f", to: "#d946ef", ink: "#fdf4ff" },
    { from: "#831843", to: "#f472b6", ink: "#fdf2f8" },
  ],
  icecek: [
    { from: "#0c4a6e", to: "#0ea5e9", ink: "#f0f9ff" },
    { from: "#164e63", to: "#06b6d4", ink: "#ecfeff" },
    { from: "#1e3a8a", to: "#3b82f6", ink: "#eff6ff" },
  ],
  default: [{ from: "#374151", to: "#6b7280", ink: "#f9fafb" }],
};

const CATEGORY_INITIALS: Record<ProductCategory, string> = {
  kebap: "Kb",
  pide: "Pd",
  lahmacun: "Lh",
  durum: "Dr",
  kilo: "Kl",
  corba: "Çb",
  tatli: "Tt",
  icecek: "İç",
};

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function abbreviate(name: string): string {
  const words = name
    .replace(/[^\p{L}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "•";
  if (words.length === 1) {
    const w = words[0]!;
    return (w.charAt(0).toUpperCase() + (w.charAt(1)?.toLowerCase() ?? "")).slice(
      0,
      2,
    );
  }
  return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
}

interface TileOpts {
  size: number;
  bg: Tone;
  text: string;
  fontSize: number;
  fontWeight: number;
}

function generateTileSvg(opts: TileOpts): string {
  const { size, bg, text, fontSize, fontWeight } = opts;
  // Subtle dot pattern + zarif corner-overlay diagonal vurgusu
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
<stop offset="0%" stop-color="${bg.from}"/>
<stop offset="100%" stop-color="${bg.to}"/>
</linearGradient>
<pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
<circle cx="12" cy="12" r="1" fill="${bg.ink}" fill-opacity="0.12"/>
</pattern>
<linearGradient id="sheen" x1="0%" y1="0%" x2="100%" y2="100%">
<stop offset="0%" stop-color="${bg.ink}" stop-opacity="0.18"/>
<stop offset="60%" stop-color="${bg.ink}" stop-opacity="0"/>
</linearGradient>
</defs>
<rect width="${size}" height="${size}" fill="url(#bg)"/>
<rect width="${size}" height="${size}" fill="url(#dots)"/>
<rect width="${size}" height="${size}" fill="url(#sheen)"/>
<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="${fontWeight}" font-family="ui-serif, Georgia, 'Times New Roman', serif" fill="${bg.ink}" fill-opacity="0.92" letter-spacing="-2">${escapeXml(text)}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
