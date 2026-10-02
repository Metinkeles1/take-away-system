import type { ProductCategory } from "@/types";

// Sepette ürün satırına tek dokunuşla eklenen hazır istekler ("Soğansız" vb.).
// Kategoriye göre: dürümde soğan/maydanoz, pidede pişme derecesi öne çıkar.
// Listeyi değiştirmek için yalnız burayı düzenlemek yeter; seçilen metin
// siparişe olduğu gibi kaydedilir (eski siparişler etkilenmez).
export const ITEM_OPTIONS: Record<ProductCategory, string[]> = {
  durum: ["Soğansız", "Maydanozsuz", "Domatessiz", "Acısız", "Acılı", "Bol soslu"],
  kebap: ["Soğansız", "Maydanozsuz", "Acısız", "Acılı", "Salatasız", "Pilavsız"],
  pide: ["Az pişmiş", "İyi pişmiş", "Bol kaşarlı", "Yumurtasız", "Dilimlenmesin"],
  lahmacun: ["Soğansız", "Maydanozsuz", "Acısız", "Acılı", "Az pişmiş", "İyi pişmiş"],
  kilo: ["Soğansız", "Maydanozsuz", "Acısız", "Acılı"],
  corba: ["Limonsuz", "Pul biberli", "Ekmeksiz"],
  tatli: ["Kaymaklı", "Kaymaksız", "Fıstıklı"],
  icecek: ["Soğuk", "Buzsuz"],
};

export function itemOptionsFor(category: ProductCategory): string[] {
  return ITEM_OPTIONS[category] ?? [];
}
