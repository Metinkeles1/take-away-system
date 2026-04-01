"use server";

import { connectDB } from "@/lib/mongodb";
import ProductModel from "@/models/Product";
import { type Product, type ProductCategory } from "@/types";
import { MENU_ITEMS } from "@/data/menu";

function docToProduct(doc: Record<string, unknown>): Product {
  return {
    id: doc.id as string,
    name: doc.name as string,
    price: doc.price as number,
    category: doc.category as ProductCategory,
    description: doc.description as string | undefined,
    available: doc.available as boolean,
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
): Promise<void> {
  await connectDB();
  await ProductModel.create({
    id: product.id ?? crypto.randomUUID(),
    name: product.name,
    price: product.price,
    category: product.category,
    description: product.description,
    available: product.available,
  });
}

// ─── Ürün güncelle ─────────────────────────────────────────────────────────
export async function updateProduct(
  id: string,
  data: Partial<Omit<Product, "id">>,
): Promise<void> {
  await connectDB();
  await ProductModel.findOneAndUpdate({ id }, { $set: data });
}

// ─── Ürün sil ──────────────────────────────────────────────────────────────
export async function deleteProduct(id: string): Promise<void> {
  await connectDB();
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

// ─── Menüdeki sabit verileri DB'ye aktar (ilk kurulum) ─────────────────────
export async function seedProducts(): Promise<number> {
  await connectDB();
  const existing = await ProductModel.countDocuments();
  if (existing > 0) return 0;

  const docs = MENU_ITEMS.map((item, i) => ({
    ...item,
    sortOrder: i,
  }));
  await ProductModel.insertMany(docs);
  return docs.length;
}
