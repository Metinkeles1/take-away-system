// Büyük resmi yüklemeden önce tarayıcıda küçültür (en uzun kenar 2400px,
// WebP). Telefon fotoğrafları 3-10 MB gelir; sunucu eylemleri ise 1 MB'tan
// büyük gövdeyi reddeder (Vercel'de de 4.5 MB sınırı var) — "bazen ürün
// eklenmiyor" hatasının sebebi buydu. Küçültülmüş hali ~200-500 KB olur.
// Tarayıcı resmi çözemezse (ör. HEIC) orijinal dosya döner.
// Sunucu da sharp ile bir kez daha encode ettiği için sınırın altındaki
// dosyaya dokunulmaz (çift sıkıştırma kaliteyi düşürür); küçültme yalnız
// sınırı aşan büyük fotoğrafta ve yüksek kaliteyle yapılır.
const MAX_SIDE = 2400; // sunucu 1600'e indirir; burada pay bırak
const QUALITY = 0.95;
const SKIP_BELOW_BYTES = 3.5 * 1024 * 1024;

export async function compressImage(file: File): Promise<File> {
  if (file.size <= SKIP_BELOW_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY),
    );
    // Safari eski sürümleri WebP üretemez → PNG döner; o durumda JPEG dene
    const out =
      blob && blob.type === "image/webp"
        ? blob
        : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!out || out.size >= file.size) return file;
    const ext = out.type === "image/webp" ? "webp" : "jpg";
    return new File([out], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type: out.type });
  } catch {
    return file;
  }
}
