import "server-only";

// Veritabanında saklanan gizli bilgileri (API anahtarı/şifresi) şifreler.
// AES-256-GCM; anahtar CREDENTIALS_SECRET env'inden, yoksa MONGODB_URI'den türetilir.
//
// Neden MONGODB_URI yedeği: işletme sahibi env düzenlemeden Ayarlar'dan hesap
// ekleyebilsin. Bu yedekle de DB yedeği/dökümü sızarsa anahtarlar açık metin
// görünmez. Daha güçlü ayrım isteyen kurulum CREDENTIALS_SECRET tanımlar —
// ama tanımladıktan sonra eski kayıtlar çözülemez; anahtarların yeniden girilmesi gerekir.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "v1:";

function key(): Buffer {
  const material = process.env.CREDENTIALS_SECRET || process.env.MONGODB_URI;
  if (!material) throw new Error("Şifreleme anahtarı yok (CREDENTIALS_SECRET / MONGODB_URI).");
  return createHash("sha256").update(`take-away-credentials:${material}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
}

// Çözülemezse (anahtar değişti / bozuk kayıt) null döner.
export function decryptSecret(stored: string | undefined | null): string | null {
  if (!stored || !stored.startsWith(PREFIX)) return null;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
