"use server";

import { connectDB } from "@/lib/mongodb";
import SettingModel from "@/models/Setting";
import type { CategoryOptions, ItemOptionGroup, ProductCategory } from "@/types";
import { DEFAULT_CATEGORY_OPTIONS } from "@/lib/orders/itemOptions";

// Kategori seçenekleri tek ayar dokümanında tutulur: { [kategori]: gruplar }.
// Kayıt yoksa (ilk kurulum) koddaki varsayılan liste döner; ilk kayıtta yazılır.
const CATEGORY_OPTIONS_KEY = "categoryOptions";

export async function getCategoryOptions(): Promise<CategoryOptions> {
  await connectDB();
  const doc = await SettingModel.findOne({ key: CATEGORY_OPTIONS_KEY }).select("value").lean();
  const saved = (doc as { value?: Partial<CategoryOptions> } | null)?.value ?? {};
  // Kayıtta olmayan kategori varsayılanı alır (yeni kategori eklenirse de çalışsın)
  return { ...DEFAULT_CATEGORY_OPTIONS, ...saved };
}

// Gelen grupları temizler: boş adlı seçenek/grup atılır, fiyat tam TL ve ≥ 0.
// Seçim siparişe ad olarak yazıldığı için kategori içinde aynı ad iki kez olamaz.
function sanitize(groups: ItemOptionGroup[]): ItemOptionGroup[] {
  const seen = new Set<string>();
  const clean: ItemOptionGroup[] = [];
  for (const g of groups) {
    const options = [];
    for (const o of g.options) {
      const label = o.label.trim();
      if (!label) continue;
      const k = label.toLocaleLowerCase("tr-TR");
      if (seen.has(k)) throw new Error(`"${label}" seçeneği iki kez yazılmış`);
      seen.add(k);
      const price = Math.max(0, Math.round(Number(o.price) || 0));
      options.push({ id: String(o.id), label, price });
    }
    if (options.length === 0) continue;
    clean.push({
      id: String(g.id),
      name: g.name.trim() || "İstekler",
      mode: g.mode === "single" ? "single" : "multi",
      options,
    });
  }
  return clean;
}

export async function saveCategoryOptions(
  category: ProductCategory,
  groups: ItemOptionGroup[],
): Promise<ItemOptionGroup[]> {
  if (!(category in DEFAULT_CATEGORY_OPTIONS)) throw new Error("Geçersiz kategori");
  const clean = sanitize(groups);
  await connectDB();
  await SettingModel.updateOne(
    { key: CATEGORY_OPTIONS_KEY },
    { $set: { [`value.${category}`]: clean } },
    { upsert: true },
  );
  return clean;
}
