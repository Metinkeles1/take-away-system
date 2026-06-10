// PWA ikonlarını üretir: panelin emerald temalı alışveriş çantası (lucide ShoppingBag).
// Kaynak SVG'yi sharp ile PNG'ye çevirir; 192/512 (any) + 512 (maskable) + apple-touch.
// Çalıştır: node scripts/generate-pwa-icons.mjs  (prebuild/predev'e bağlı, elle de çalışır)
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");

// lucide-react "shopping-bag" path'leri (24x24 viewBox).
const BAG = `
  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
  <path d="M3 6h18"/>
  <path d="M16 10a4 4 0 0 1-8 0"/>
`;

/**
 * @param {number} size  kenar uzunluğu (px)
 * @param {object} opts
 * @param {boolean} [opts.maskable]  true ise tam dolgu (köşe yuvarlaması yok), çanta güvenli alanda küçük
 */
function buildSvg(size, { maskable = false } = {}) {
  // Maskable ikonlarda içerik merkezi %80'lik güvenli alanda kalmalı → çantayı küçült.
  const fraction = maskable ? 0.46 : 0.56;
  const scale = (size * fraction) / 24;
  const offset = (size - 24 * scale) / 2;
  const radius = maskable ? 0 : Math.round(size * 0.18);
  const stroke = 2; // 24 birimlik uzayda; ölçeklenince görsel olarak dengeli kalır

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#047857"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
  <g transform="translate(${offset}, ${offset}) scale(${scale})"
     fill="none" stroke="white" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    ${BAG}
  </g>
</svg>`;
}

async function render(size, opts, filename) {
  const svg = buildSvg(size, opts);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(join(outDir, filename), png);
  console.log(`  ✓ ${filename} (${size}x${size})`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  console.log("PWA ikonları üretiliyor → public/icons/");
  await render(192, {}, "icon-192.png");
  await render(512, {}, "icon-512.png");
  await render(512, { maskable: true }, "icon-maskable-512.png");
  await render(180, { maskable: true }, "apple-touch-icon.png");
  console.log("Tamam.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
