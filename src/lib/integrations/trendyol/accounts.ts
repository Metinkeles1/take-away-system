import "server-only";

// Trendyol hesap çözümleyici — hangi isteğin hangi satıcı hesabıyla (API anahtarı)
// gideceğine karar verir.
//
// Kaynak: TrendyolAccount koleksiyonu (Ayarlar > Trendyol Hesapları). Koleksiyon
// boşsa eski kurulumlarla uyum için .env'deki tek hesap kullanılır (id "env").
// Okuma 30 sn bellekte tutulur; Ayarlar'dan kayıt değişince bu süreç anında
// tazelenir, diğer sunucu örnekleri en geç 30 sn içinde yeni listeyi görür.

import { connectDB } from "@/lib/mongodb";
import { decryptSecret } from "@/lib/crypto/secretBox";
import TrendyolAccountModel from "@/models/TrendyolAccount";
import TrendyolOrderModel from "@/models/TrendyolOrder";
import { trendyolScope } from "./scope";

export interface TrendyolCreds {
  id: string; // Mongo _id ya da "env"
  name: string;
  supplierId: string;
  token: string; // base64(key:secret)
  storeIds: number[];
  color: string;
}

export const ENV_ACCOUNT_ID = "env";
const CACHE_MS = 30_000;

let cache: { at: number; list: TrendyolCreds[] } | null = null;

function parseStoreIds(raw: string | undefined): number[] {
  if (!raw) return [];
  const ids = raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(ids)];
}

// .env'deki eski tek hesap (varsa).
export function envAccount(): TrendyolCreds | null {
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID?.trim();
  const token =
    process.env.TRENDYOL_API_TOKEN ??
    (process.env.TRENDYOL_API_KEY && process.env.TRENDYOL_API_SECRET
      ? Buffer.from(
          `${process.env.TRENDYOL_API_KEY}:${process.env.TRENDYOL_API_SECRET}`,
        ).toString("base64")
      : undefined);
  if (!supplierId || !token) return null;
  return {
    id: ENV_ACCOUNT_ID,
    name: "Trendyol",
    supplierId,
    token,
    storeIds: parseStoreIds(process.env.TRENDYOL_STORE_ID),
    color: "orange",
  };
}

export function invalidateTrendyolAccounts() {
  cache = null;
}

interface AccountRow {
  _id: { toString(): string };
  name: string;
  supplierId: string;
  apiKeyEnc: string;
  apiSecretEnc: string;
  storeIds?: number[];
  active?: boolean;
  color?: string;
}

// Aktif ve anahtarı çözülebilen hesaplar; işletme kapsamı varsa yalnız o hesap
// (bkz. scope.ts). DB'de hiç hesap yoksa env hesabı.
export async function getTrendyolAccounts(): Promise<TrendyolCreds[]> {
  const all = await getAllTrendyolAccounts();
  const scope = trendyolScope();
  return scope ? all.filter((a) => a.supplierId === scope) : all;
}

// Kapsamdan bağımsız tüm aktif hesaplar (etiket/filtre listesi için).
export async function getAllTrendyolAccounts(): Promise<TrendyolCreds[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.list;

  await connectDB();
  const rows = await TrendyolAccountModel.find().sort({ createdAt: 1 }).lean<AccountRow[]>();

  let list: TrendyolCreds[];
  if (rows.length === 0) {
    const env = envAccount();
    list = env ? [env] : [];
  } else {
    list = [];
    for (const r of rows) {
      if (r.active === false) continue;
      const key = decryptSecret(r.apiKeyEnc);
      const secret = decryptSecret(r.apiSecretEnc);
      if (!key || !secret) {
        console.warn("[trendyol accounts] anahtar çözülemedi:", r.name);
        continue;
      }
      list.push({
        id: r._id.toString(),
        name: r.name,
        supplierId: r.supplierId,
        token: Buffer.from(`${key}:${secret}`).toString("base64"),
        storeIds: r.storeIds ?? [],
        color: r.color || "orange",
      });
    }
    // Hiçbir kayıt çözülemediyse (ör. yerelde ve Vercel'de şifreleme anahtarı
    // farklı) Trendyol tamamen kesilmesin: .env hesabı varsa onunla devam et.
    if (list.length === 0 && rows.some((r) => r.active !== false)) {
      const env = envAccount();
      if (env) list = [env];
    }
  }

  cache = { at: Date.now(), list };
  return list;
}

export async function isTrendyolConfigured(): Promise<boolean> {
  try {
    return (await getTrendyolAccounts()).length > 0;
  } catch {
    return false;
  }
}

export async function getDefaultTrendyolAccount(): Promise<TrendyolCreds> {
  const list = await getTrendyolAccounts();
  if (list.length === 0) {
    throw new Error("Trendyol hesabı yok: Ayarlar > Trendyol Hesapları'ndan ekleyin.");
  }
  return list[0];
}

export async function accountForSupplier(
  supplierId: string | number | null | undefined,
): Promise<TrendyolCreds | null> {
  if (supplierId === null || supplierId === undefined || supplierId === "") return null;
  const list = await getTrendyolAccounts();
  return list.find((a) => a.supplierId === String(supplierId)) ?? null;
}

// Mağaza → hesap. Önce hesabın tanımlı mağaza listesine, sonra arşivdeki
// siparişlere (storeId ↔ supplierId) bakar. Tek hesap varsa o döner.
export async function accountForStore(
  storeId: string | number,
): Promise<TrendyolCreds | null> {
  const list = await getTrendyolAccounts();
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  const sid = Number(storeId);
  const direct = list.find((a) => a.storeIds.includes(sid));
  if (direct) return direct;
  try {
    const doc = await TrendyolOrderModel.findOne({ storeId: sid, supplierId: { $exists: true } })
      .select({ supplierId: 1 })
      .lean<{ supplierId?: number }>();
    if (doc?.supplierId) return accountForSupplier(doc.supplierId);
  } catch {
    /* arşiv okunamazsa bilinmiyor say */
  }
  return null;
}

// Paket → hesap (kabul/yola çıktı/teslim/iptal için). Arşivdeki kayıttan bulunur.
// Bulunamazsa null → çağıran tüm hesapları sırayla dener.
export async function accountForPackage(packageId: string): Promise<TrendyolCreds | null> {
  const list = await getTrendyolAccounts();
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  try {
    const doc = await TrendyolOrderModel.findOne({ packageId })
      .select({ supplierId: 1, storeId: 1 })
      .lean<{ supplierId?: number; storeId?: number }>();
    if (doc?.supplierId) {
      const a = await accountForSupplier(doc.supplierId);
      if (a) return a;
    }
    if (doc?.storeId) return accountForStore(doc.storeId);
  } catch {
    /* bilinmiyor */
  }
  return null;
}

// Sipariş → işletme etiketi. Tek hesap varsa etiket gereksiz → hep undefined.
export async function trendyolAccountLabeler(): Promise<
  (supplierId: string | number | null | undefined) => { name: string; color: string } | undefined
> {
  let list: TrendyolCreds[] = [];
  try {
    list = await getAllTrendyolAccounts();
  } catch {
    /* etiketsiz devam */
  }
  if (list.length < 2) return () => undefined;
  const map = new Map(list.map((a) => [a.supplierId, { name: a.name, color: a.color }]));
  return (supplierId) =>
    supplierId === null || supplierId === undefined ? undefined : map.get(String(supplierId));
}

// Tüm hesapların bilinen mağaza ID'leri (hesap bilgisiyle).
export async function getAllTrendyolStores(): Promise<
  Array<{ storeId: number; account: TrendyolCreds }>
> {
  const list = await getTrendyolAccounts();
  const out: Array<{ storeId: number; account: TrendyolCreds }> = [];
  const seen = new Set<number>();
  for (const a of list) {
    for (const storeId of a.storeIds) {
      if (seen.has(storeId)) continue;
      seen.add(storeId);
      out.push({ storeId, account: a });
    }
  }
  return out;
}
