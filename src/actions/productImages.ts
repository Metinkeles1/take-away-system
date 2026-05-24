"use server";

import { put, del } from "@vercel/blob";
import sharp from "sharp";
import { productSlug } from "@/lib/images";

const MAX_WIDTH = 1600;
const WEBP_QUALITY = 88;
const WEBP_EFFORT = 6; // 0-6 — yüksek = daha iyi sıkıştırma, marjinal yavaş; food için fark eder
const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15 MB — kullanıcı orijinal yüksek çözünürlükten gönderebilir

/**
 * Slug + timestamp ile insan-okunabilir dosya adı üretir.
 * Örn: products/adana-kebap-1779653466578.webp
 */
function buildFilename(productName: string, productId: string): string {
  const slug = productSlug(productName) || productId;
  return `products/${slug}-${Date.now()}.webp`;
}

/**
 * Bir resim dosyasını sharp ile resize + WebP'e dönüştürüp Vercel Blob'a yükler.
 * URL'i döner; bu URL Product.image alanına yazılır.
 *
 * FormData ile çağrılmalı:
 *   form.append("file", File)
 *   form.append("productId", id)
 *   form.append("productName", name)
 */
export async function uploadProductImage(formData: FormData): Promise<{ url: string }> {
  const file = formData.get("file");
  const productId = formData.get("productId");
  const productName = formData.get("productName");

  if (!(file instanceof File)) {
    throw new Error("Dosya bulunamadı");
  }
  if (typeof productId !== "string" || !productId) {
    throw new Error("productId zorunlu");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Dosya çok büyük (maks 15 MB)");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Sadece resim dosyası yüklenebilir");
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  // Resize (max 1600px) + WebP @ 88. Food fotoğraflarındaki doku iyi korunur.
  // Orijinal 24MB JPEG → ~250-400KB WebP'e iner.
  const optimized = await sharp(inputBuffer)
    .rotate() // EXIF orientation'ı düzelt
    .resize({ width: MAX_WIDTH, withoutEnlargement: true, kernel: "lanczos3" })
    .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
    .toBuffer();

  const name = typeof productName === "string" ? productName : "";
  const filename = buildFilename(name, productId);

  const blob = await put(filename, optimized, {
    access: "public",
    contentType: "image/webp",
    cacheControlMaxAge: 60 * 60 * 24 * 365, // 1 yıl — URL'de timestamp olduğu için güvenli
  });

  return { url: blob.url };
}

/**
 * Verilen Blob URL'ini siler. Sadece Vercel Blob URL'lerini siler;
 * yerel /images/products yolları no-op olur (silinmez, sadece DB'den koparılır).
 */
export async function deleteProductImage(url: string): Promise<void> {
  if (!url) return;
  if (
    !url.includes(".blob.vercel-storage.com") &&
    !url.includes(".public.blob.vercel-storage.com")
  ) {
    return;
  }
  try {
    await del(url);
  } catch (e) {
    // Silme başarısız olsa bile DB güncellenebilmeli — log + yut
    console.error("Blob silme hatası:", e);
  }
}
