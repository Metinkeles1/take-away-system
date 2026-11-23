"use server";

import { connectDB } from "@/lib/mongodb";
import SettingModel from "@/models/Setting";
import ProductModel from "@/models/Product";
import type { MenuCategory } from "@/types";
import { MENU_CATEGORIES } from "@/data/menu";
import { productSlug } from "@/lib/images";

// Menü kategorileri tek ayar dokümanında, sıralı liste olarak tutulur.
// Kayıt yoksa koddaki varsayılan liste döner; ilk değişiklikte DB'ye yazılır.
const KEY = "menuCategories";

export async function getMenuCategories(): Promise<MenuCategory[]> {
  await connectDB();
  const doc = await SettingModel.findOne({ key: KEY }).select("value").lean();
  const saved = (doc as { value?: MenuCategory[] } | null)?.value;
  return Array.isArray(saved) && saved.length > 0 ? saved : MENU_CATEGORIES;
}

async function save(list: MenuCategory[]): Promise<MenuCategory[]> {
  await SettingModel.updateOne({ key: KEY }, { $set: { value: list } }, { upsert: true });
  return list;
}

function cleanLabel(label: string): string {
  const l = label.trim().replace(/\s+/g, " ");
  if (!l) throw new Error("Kategori adı boş olamaz");
  if (l.length > 30) throw new Error("Kategori adı en fazla 30 karakter");
  return l;
}

function cleanEmoji(emoji: string): string {
  return emoji.trim().slice(0, 8) || "🍽️";
}

function assertUniqueLabel(list: MenuCategory[], label: string, except?: string) {
  const k = label.toLocaleLowerCase("tr-TR");
  if (list.some((c) => c.value !== except && c.label.toLocaleLowerCase("tr-TR") === k)) {
    throw new Error(`"${label}" adında bir kategori zaten var`);
  }
}

export async function addMenuCategory(label: string, emoji: string): Promise<MenuCategory[]> {
  const list = await getMenuCategories();
  const name = cleanLabel(label);
  assertUniqueLabel(list, name);
  // Kalıcı anahtar addan türetilir; çakışırsa sonuna sayı eklenir.
  const base = productSlug(name) || "kategori";
  let value = base;
  for (let i = 2; list.some((c) => c.value === value); i++) value = `${base}-${i}`;
  return save([...list, { value, label: name, emoji: cleanEmoji(emoji) }]);
}

export async function updateMenuCategory(
  value: string,
  patch: { label: string; emoji: string },
): Promise<MenuCategory[]> {
  const list = await getMenuCategories();
  if (!list.some((c) => c.value === value)) throw new Error("Kategori bulunamadı");
  const name = cleanLabel(patch.label);
  assertUniqueLabel(list, name, value);
  return save(
    list.map((c) => (c.value === value ? { ...c, label: name, emoji: cleanEmoji(patch.emoji) } : c)),
  );
}

export async function reorderMenuCategories(values: string[]): Promise<MenuCategory[]> {
  const list = await getMenuCategories();
  const byValue = new Map(list.map((c) => [c.value, c]));
  const ordered = [...new Set(values)]
    .map((v) => byValue.get(v))
    .filter((c): c is MenuCategory => !!c);
  // Listede unutulan kategori kaybolmasın — sona ekle
  for (const c of list) if (!values.includes(c.value)) ordered.push(c);
  return save(ordered);
}

// Sadece içinde ürün olmayan kategori silinir (ürünler sahipsiz kalmasın).
export async function deleteMenuCategory(value: string): Promise<MenuCategory[]> {
  const list = await getMenuCategories();
  if (list.length <= 1) throw new Error("En az bir kategori kalmalı");
  const count = await ProductModel.countDocuments({ category: value });
  if (count > 0) {
    throw new Error(`Bu kategoride ${count} ürün var — önce ürünleri başka kategoriye taşıyın`);
  }
  return save(list.filter((c) => c.value !== value));
}
