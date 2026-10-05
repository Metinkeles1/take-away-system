import { uploadProductImage } from "@/actions/productImages";
import { compressImage } from "@/lib/compressImage";

// next.config'teki serverActions.bodySizeLimit ile aynı (Vercel sınırı 4.5 MB)
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// Ekle/düzenle pencerelerinin ortak yüklemesi: önce tarayıcıda küçült,
// sonra sunucuya gönder. Sınırı aşarsa anlaşılır bir hata fırlatır.
export async function uploadImageFile(
  file: File,
  productId: string,
  productName: string,
): Promise<string> {
  const small = await compressImage(file);
  if (small.size > MAX_UPLOAD_BYTES) {
    throw new Error("Resim çok büyük ve küçültülemedi — JPG veya PNG olarak deneyin");
  }
  const fd = new FormData();
  fd.append("file", small);
  fd.append("productId", productId);
  fd.append("productName", productName);
  try {
    const { url } = await uploadProductImage(fd);
    return url;
  } catch (e) {
    console.error(e);
    // Sunucu hata metni production'da gizlenir — kullanıcıya anlaşılır mesaj
    throw new Error("Resim yüklenemedi, internet bağlantısını kontrol edip tekrar deneyin");
  }
}
