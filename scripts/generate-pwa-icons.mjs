// PWA ikonlarını üretir (sharp ile SVG → PNG).
//   • Ana panel:  emerald zemin + alışveriş çantası  → public/icons/icon-*.png
//   • Kurye app:  slate zemin  + bisiklet (kurye)     → public/icons/kurye-*.png
// Çalıştır: node scripts/generate-pwa-icons.mjs  (prebuild/predev'e bağlı, elle de çalışır)
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");

// lucide "shopping-bag" — ana panel (24x24 viewBox).
const BAG = `
  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
  <path d="M3 6h18"/>
  <path d="M16 10a4 4 0 0 1-8 0"/>
`;

// lucide "bike" — kurye uygulaması (24x24 viewBox).
const BIKE = `
  <circle cx="18.5" cy="17.5" r="3.5"/>
  <circle cx="5.5" cy="17.5" r="3.5"/>
  <circle cx="15" cy="5" r="1"/>
  <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
`;

const THEMES = {
  app: { glyph: BAG, from: "#059669", to: "#047857" }, // emerald
  kurye: { glyph: BIKE, from: "#1e293b", to: "#0f172a" }, // slate
};

/**
 * @param {number} size  kenar uzunluğu (px)
 * @param {{glyph:string, from:string, to:string}} theme
 * @param {boolean} [maskable]  true ise tam dolgu (köşe yuvarlaması yok), glyph güvenli alanda
 */
function buildSvg(size, theme, maskable = false) {
  // Maskable ikonlarda içerik merkezi %80'lik güvenli alanda kalmalı → glyph'i küçült.
  const fraction = maskable ? 0.46 : 0.56;
  const scale = (size * fraction) / 24;
  const offset = (size - 24 * scale) / 2;
  const radius = maskable ? 0 : Math.round(size * 0.18);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.from}"/>
      <stop offset="100%" stop-color="${theme.to}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
  <g transform="translate(${offset}, ${offset}) scale(${scale})"
     fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${theme.glyph}
  </g>
</svg>`;
}

async function render(size, theme, maskable, filename) {
  const png = await sharp(Buffer.from(buildSvg(size, theme, maskable))).png().toBuffer();
  await writeFile(join(outDir, filename), png);
  console.log(`  ✓ ${filename} (${size}x${size})`);
}

async function renderSet(prefix, theme) {
  await render(192, theme, false, `${prefix}-192.png`);
  await render(512, theme, false, `${prefix}-512.png`);
  await render(512, theme, true, `${prefix}-maskable-512.png`);
  await render(180, theme, true, `${prefix}-apple-touch.png`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  console.log("PWA ikonları üretiliyor → public/icons/");
  await renderSet("icon", THEMES.app); // icon-192.png, icon-512.png, ...
  await renderSet("kurye", THEMES.kurye); // kurye-192.png, kurye-512.png, ...
  console.log("Tamam.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
