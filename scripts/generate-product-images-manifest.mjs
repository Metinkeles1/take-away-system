// Build/dev öncesi çalışır: public/images/products altındaki .jpg/.png/.webp dosyalarını
// tarar ve src/lib/product-images.manifest.ts içine slug Set'i olarak yazar.
// Amaç: dosya olmayan ürünler için tarayıcıda 404 oluşmasını engellemek.

import { readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, parse } from "node:path";

const ROOT = process.cwd();
const DIR = join(ROOT, "public", "images", "products");
const OUT = join(ROOT, "src", "lib", "product-images.manifest.ts");

const exts = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

let entries = [];
if (existsSync(DIR)) {
  entries = readdirSync(DIR)
    .map((f) => parse(f))
    .filter((p) => exts.has(p.ext.toLowerCase()))
    .map((p) => ({ slug: p.name, file: p.base }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

const body = `// AUTO-GENERATED — do not edit by hand.
// Üretici: scripts/generate-product-images-manifest.mjs
// Tarama: public/images/products/

export const PRODUCT_IMAGE_FILES: Readonly<Record<string, string>> = {
${entries.map((e) => `  ${JSON.stringify(e.slug)}: ${JSON.stringify(e.file)},`).join("\n")}
};

export const PRODUCT_IMAGE_SLUGS: ReadonlySet<string> = new Set(
  Object.keys(PRODUCT_IMAGE_FILES),
);
`;

mkdirSync(parse(OUT).dir, { recursive: true });
writeFileSync(OUT, body, "utf8");
console.log(`[product-images] manifest yazıldı: ${entries.length} dosya`);
