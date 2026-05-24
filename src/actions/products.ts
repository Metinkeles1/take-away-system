"use server";

import { connectDB } from "@/lib/mongodb";
import ProductModel from "@/models/Product";
import {
  type Product,
  type ProductCategory,
  PORTIONABLE_CATEGORIES,
} from "@/types";
import { MENU_ITEMS } from "@/data/menu";
import { deleteProductImage } from "./productImages";

function docToProduct(doc: Record<string, unknown>): Product {
  return {
    id: doc.id as string,
    name: doc.name as string,
    price: doc.price as number,
    category: doc.category as ProductCategory,
    description: doc.description as string | undefined,
    available: doc.available as boolean,
    image: doc.image as string | undefined,
    portionable: (doc.portionable as boolean | undefined) ?? false,
  };
}

// ─── Tüm ürünleri getir (kategori + sıralama) ─────────────────────────────
export async function getProducts(): Promise<Product[]> {
  await connectDB();
  const docs = await ProductModel.find().sort({ category: 1, sortOrder: 1, name: 1 }).lean();
  return docs.map((d) => docToProduct(d as Record<string, unknown>));
}

// ─── Sadece aktif ürünleri getir (sipariş sayfası için) ────────────────────
export async function getAvailableProducts(): Promise<Product[]> {
  await connectDB();
  const docs = await ProductModel.find({ available: true })
    .sort({ category: 1, sortOrder: 1, name: 1 })
    .lean();
  return docs.map((d) => docToProduct(d as Record<string, unknown>));
}

// ─── Yeni ürün ekle ────────────────────────────────────────────────────────
export async function createProduct(
  product: Omit<Product, "id"> & { id?: string },
): Promise<string> {
  await connectDB();
  const id = product.id ?? crypto.randomUUID();
  await ProductModel.create({
    id,
    name: product.name,
    price: product.price,
    category: product.category,
    description: product.description,
    available: product.available,
    image: product.image,
    portionable: product.portionable ?? false,
  });
  return id;
}

// ─── Ürün güncelle ─────────────────────────────────────────────────────────
export async function updateProduct(
  id: string,
  data: Partial<Omit<Product, "id">>,
): Promise<void> {
  await connectDB();

  // Resim değiştiyse veya kaldırıldıysa eski Blob'u sil
  if ("image" in data) {
    const existing = await ProductModel.findOne({ id }).lean();
    const oldImage = (existing as Record<string, unknown> | null)?.image as
      | string
      | undefined;
    if (oldImage && oldImage !== data.image) {
      await deleteProductImage(oldImage);
    }
  }

  await ProductModel.findOneAndUpdate({ id }, { $set: data });
}

// ─── Ürün sil ──────────────────────────────────────────────────────────────
export async function deleteProduct(id: string): Promise<void> {
  await connectDB();
  const existing = await ProductModel.findOne({ id }).lean();
  const image = (existing as Record<string, unknown> | null)?.image as
    | string
    | undefined;
  if (image) {
    await deleteProductImage(image);
  }
  await ProductModel.deleteOne({ id });
}

// ─── Ürün durumunu değiştir (aktif/pasif) ──────────────────────────────────
export async function toggleProductAvailability(id: string): Promise<void> {
  await connectDB();
  const doc = await ProductModel.findOne({ id });
  if (doc) {
    doc.available = !doc.available;
    await doc.save();
  }
}

// ─── Porsiyon bayrağı backfill ─────────────────────────────────────────────
// Geçmişte hardcoded PORTIONABLE_CATEGORIES (kebap/pide/dürüm) ile çalışıyordu;
// schema'ya portionable alanı eklenince bu ürünlerin bazıları flag'siz kaldı.
// Sadece flag'i true olmayanları (false veya undefined) etkiler — kullanıcının
// elle pasifleştirdikleri de geri açılır; bu trade-off bilinçli (talep edildi).
// Idempotent: her ürün düzeldikten sonra count 0 döner, sessizce no-op olur.
export async function backfillProductPortions(): Promise<number> {
  await connectDB();
  const result = await ProductModel.updateMany(
    {
      category: { $in: PORTIONABLE_CATEGORIES },
      portionable: { $ne: true },
    },
    { $set: { portionable: true } },
  );
  return result.modifiedCount;
}

// ─── Menüdeki sabit verileri DB'ye aktar (ilk kurulum) ─────────────────────
// Portionable bayrağı kategori bazlı default'la dolar; image alanı boş gelir,
// kullanıcı UI'dan teker teker yükler.
export async function seedProducts(): Promise<number> {
  await connectDB();
  const existing = await ProductModel.countDocuments();
  if (existing > 0) return 0;

  const docs = MENU_ITEMS.map((item, i) => ({
    ...item,
    sortOrder: i,
    portionable: PORTIONABLE_CATEGORIES.includes(item.category),
  }));
  await ProductModel.insertMany(docs);
  return docs.length;
}
