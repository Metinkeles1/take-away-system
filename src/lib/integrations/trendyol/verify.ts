// Trendyol webhook isteklerini doğrular.
//
// Trendyol'un GO Yemek webhook'unun kesin auth şeması partner dokümanında —
// doküman olmadan iki yaygın varyantı da destekliyoruz:
//
//   1) Authorization: Basic <base64(API_KEY:API_SECRET)>  (Marketplace standardı)
//   2) x-api-key: <API_KEY>                                (bazı GO entegrasyonları)
//
// Constant-time karşılaştırma timing-attack riskini azaltır.

import { timingSafeEqual } from "node:crypto";

function safeEqual(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyTrendyolApiKey(received: string | null | undefined): boolean {
  const expected = process.env.TRENDYOL_WEBHOOK_API_KEY ?? process.env.TRENDYOL_API_KEY;
  if (!expected || !received) return false;
  return safeEqual(received, expected);
}

export function verifyTrendyolBasicAuth(
  authHeader: string | null | undefined,
): boolean {
  if (!authHeader) return false;
  const match = /^Basic\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return false;
  const received = match[1].trim();

  // 1) Önce hazır TOKEN ile karşılaştır (en hızlı yol)
  const token = process.env.TRENDYOL_API_TOKEN;
  if (token && safeEqual(received, token)) return true;

  // 2) Token yoksa API_KEY:API_SECRET'tan üret ve karşılaştır
  const key = process.env.TRENDYOL_API_KEY;
  const secret = process.env.TRENDYOL_API_SECRET;
  if (key && secret) {
    const expected = Buffer.from(`${key}:${secret}`).toString("base64");
    if (safeEqual(received, expected)) return true;
  }
  return false;
}

/**
 * Hem `x-api-key` hem `Authorization: Basic` başlıklarını kabul eder.
 * Trendyol hangi şemayı kullanırsa kullansın geçer.
 */
export function verifyTrendyolRequest(headers: Headers): boolean {
  const apiKey = headers.get("x-api-key");
  if (verifyTrendyolApiKey(apiKey)) return true;

  const auth = headers.get("authorization");
  if (verifyTrendyolBasicAuth(auth)) return true;

  return false;
}
