"use server";

// Ayarlar > Trendyol Hesapları — işletme (satıcı hesabı) ekle/düzenle/sil/test.
// API anahtarı ve şifresi şifreli saklanır; istemciye yalnızca son 4 hane döner.

import { revalidatePath } from "next/cache";
import { connectDB } from "@/lib/mongodb";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secretBox";
import TrendyolAccountModel from "@/models/TrendyolAccount";
import TrendyolOrderModel from "@/models/TrendyolOrder";
import {
  envAccount,
  getAllTrendyolAccounts,
  invalidateTrendyolAccounts,
  type TrendyolCreds,
} from "@/lib/integrations/trendyol/accounts";
import { listTrendyolPackages } from "@/lib/integrations/trendyol/client";
import { discoverStoreIds } from "@/lib/integrations/trendyol/stores";
import { accountColor } from "@/lib/integrations/trendyol/accountColors";

export interface TrendyolAccountView {
  id: string;
  name: string;
  supplierId: string;
  apiKeyHint: string; // ••••1234
  storeIds: number[];
  active: boolean;
  color: string;
  keyBroken: boolean; // anahtar çözülemiyor → yeniden girilmeli
  lastTestAt?: string;
  lastTestOk?: boolean;
  lastTestError?: string;
}

export interface TrendyolAccountsState {
  accounts: TrendyolAccountView[];
  // DB'de hesap yok ama .env'de eski tek hesap tanımlı → şu an o kullanılıyor.
  envFallback: { supplierId: string; storeIds: number[] } | null;
}

interface Row {
  _id: { toString(): string };
  name: string;
  supplierId: string;
  apiKeyEnc: string;
  apiSecretEnc: string;
  storeIds?: number[];
  active?: boolean;
  color?: string;
  lastTestAt?: Date;
  lastTestOk?: boolean;
  lastTestError?: string;
}

function hint(plain: string | null): string {
  if (!plain) return "";
  return `••••${plain.slice(-4)}`;
}

function toView(r: Row): TrendyolAccountView {
  const key = decryptSecret(r.apiKeyEnc);
  const secret = decryptSecret(r.apiSecretEnc);
  return {
    id: r._id.toString(),
    name: r.name,
    supplierId: r.supplierId,
    apiKeyHint: hint(key),
    storeIds: r.storeIds ?? [],
    active: r.active !== false,
    color: r.color || "orange",
    keyBroken: !key || !secret,
    lastTestAt: r.lastTestAt?.toISOString(),
    lastTestOk: r.lastTestOk,
    lastTestError: r.lastTestError,
  };
}

function credsFrom(r: Row): TrendyolCreds | null {
  const key = decryptSecret(r.apiKeyEnc);
  const secret = decryptSecret(r.apiSecretEnc);
  if (!key || !secret) return null;
  return {
    id: r._id.toString(),
    name: r.name,
    supplierId: r.supplierId,
    token: Buffer.from(`${key}:${secret}`).toString("base64"),
    storeIds: r.storeIds ?? [],
    color: r.color || "orange",
  };
}

function parseStoreIds(raw: string): number[] | null {
  const parts = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const ids: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    ids.push(Number(p));
  }
  return [...new Set(ids)];
}

function changed() {
  invalidateTrendyolAccounts();
  revalidatePath("/settings");
}

export async function getTrendyolAccountsState(): Promise<TrendyolAccountsState> {
  await connectDB();
  const rows = await TrendyolAccountModel.find().sort({ createdAt: 1 }).lean<Row[]>();
  const env = rows.length === 0 ? envAccount() : null;
  return {
    accounts: rows.map(toView),
    envFallback: env ? { supplierId: env.supplierId, storeIds: env.storeIds } : null,
  };
}

// Kimlik bilgilerini Trendyol'a küçük bir istekle dener.
async function probe(
  creds: TrendyolCreds,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const end = Date.now();
  const res = await listTrendyolPackages({
    modificationStartDate: end - 24 * 60 * 60 * 1000,
    modificationEndDate: end,
    page: 0,
    size: 1,
    account: creds,
  });
  if (res.ok) return { ok: true };
  return { ok: false, status: res.status, error: res.error };
}

function probeMessage(status: number, error: string): string {
  if (status === 401 || status === 403) {
    return "Trendyol anahtarı reddetti — Satıcı ID, API anahtarı ve şifreyi kontrol edin.";
  }
  if (status === 0) return `Trendyol'a ulaşılamadı (${error}).`;
  return `Trendyol: ${status} ${error.slice(0, 200)}`;
}

export interface SaveTrendyolAccountInput {
  id?: string;
  name: string;
  supplierId: string;
  apiKey?: string; // düzenlemede boş = değiştirme
  apiSecret?: string;
  storeIds: string; // "123, 456"
  color?: string;
  active?: boolean;
}

export async function saveTrendyolAccount(
  input: SaveTrendyolAccountInput,
): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const name = input.name.trim();
  const supplierId = input.supplierId.trim();
  const apiKey = input.apiKey?.trim() ?? "";
  const apiSecret = input.apiSecret?.trim() ?? "";
  if (name.length < 2) return { ok: false, error: "İşletme adı en az 2 karakter olmalı." };
  if (!/^\d+$/.test(supplierId)) return { ok: false, error: "Satıcı ID yalnızca rakam olmalı." };
  const storeIds = parseStoreIds(input.storeIds);
  if (storeIds === null) return { ok: false, error: "Mağaza ID'leri rakam olmalı (virgülle ayırın)." };
  const color = accountColor(input.color);

  try {
    await connectDB();
    const dup = await TrendyolAccountModel.findOne({ supplierId }).select({ _id: 1 }).lean<{
      _id: { toString(): string };
    }>();
    if (dup && dup._id.toString() !== input.id) {
      return { ok: false, error: "Bu Satıcı ID ile kayıtlı bir hesap zaten var." };
    }

    let existing: Row | null = null;
    if (input.id) {
      existing = await TrendyolAccountModel.findById(input.id).lean<Row>();
      if (!existing) return { ok: false, error: "Hesap bulunamadı." };
    } else if (!apiKey || !apiSecret) {
      return { ok: false, error: "API anahtarı ve şifresi gerekli." };
    }

    // Anahtarı yalnızca biri yazılırsa diğeri eskisinden alınır.
    const keyPlain = apiKey || decryptSecret(existing?.apiKeyEnc);
    const secretPlain = apiSecret || decryptSecret(existing?.apiSecretEnc);
    if (!keyPlain || !secretPlain) {
      return { ok: false, error: "Kayıtlı anahtar okunamadı — API anahtarı ve şifreyi yeniden girin." };
    }

    // Kaydetmeden önce dene: anahtar reddedilirse kaydetme; ağ hatasıysa kaydet, uyar.
    const creds: TrendyolCreds = {
      id: input.id ?? "new",
      name,
      supplierId,
      token: Buffer.from(`${keyPlain}:${secretPlain}`).toString("base64"),
      storeIds,
      color,
    };
    const test = await probe(creds);
    if (!test.ok && (test.status === 401 || test.status === 403)) {
      return { ok: false, error: probeMessage(test.status, test.error) };
    }

    // Mağaza girilmediyse son siparişlerden bul.
    let finalStores = storeIds;
    if (test.ok && finalStores.length === 0) {
      finalStores = await discoverStoreIds(creds).catch(() => []);
    }

    const doc = {
      name,
      supplierId,
      storeIds: finalStores,
      color,
      active: input.active !== false,
      lastTestAt: new Date(),
      lastTestOk: test.ok,
      lastTestError: test.ok ? "" : probeMessage(test.status, test.error),
      ...(apiKey ? { apiKeyEnc: encryptSecret(apiKey) } : {}),
      ...(apiSecret ? { apiSecretEnc: encryptSecret(apiSecret) } : {}),
    };

    if (input.id) {
      await TrendyolAccountModel.updateOne({ _id: input.id }, { $set: doc });
    } else {
      const isFirst = (await TrendyolAccountModel.countDocuments()) === 0;
      if (isFirst) await adoptLegacyEnvAccount(supplierId);
      await TrendyolAccountModel.create(doc);
      // Eski arşiv kayıtlarında işletme bilgisi yok; ilk hesaba (ya da taşınan
      // .env hesabına) aittirler — işletme filtresinde kaybolmasınlar.
      if (isFirst) await backfillArchiveSupplier();
    }
    changed();
    return {
      ok: true,
      warning: test.ok ? undefined : `Kaydedildi ama bağlantı denenemedi: ${probeMessage(test.status, test.error)}`,
    };
  } catch (err) {
    console.error("[saveTrendyolAccount]", err);
    return { ok: false, error: "Hesap kaydedilemedi." };
  }
}

// İlk hesap eklenirken .env'de FARKLI bir hesap çalışıyorsa önce onu Ayarlar'a
// taşı. Yoksa DB'de hesap olduğu an .env yedeği devreden çıkar ve mevcut işletme
// sessizce kopar.
async function adoptLegacyEnvAccount(newSupplierId: string) {
  const key = process.env.TRENDYOL_API_KEY;
  const secret = process.env.TRENDYOL_API_SECRET;
  const env = envAccount();
  if (!env || !key || !secret || env.supplierId === newSupplierId) return;
  await TrendyolAccountModel.create({
    name: "Ana işletme",
    supplierId: env.supplierId,
    apiKeyEnc: encryptSecret(key),
    apiSecretEnc: encryptSecret(secret),
    storeIds: env.storeIds,
    color: "orange",
    active: true,
  });
}

// supplierId'siz arşiv siparişlerini ilk (en eski) hesaba yaz.
async function backfillArchiveSupplier() {
  const first = await TrendyolAccountModel.findOne()
    .sort({ createdAt: 1 })
    .select({ supplierId: 1 })
    .lean<{ supplierId: string }>();
  const id = Number(first?.supplierId);
  if (!Number.isFinite(id)) return;
  await TrendyolOrderModel.updateMany(
    { supplierId: { $exists: false } },
    { $set: { supplierId: id } },
  );
}

export async function setTrendyolAccountActive(
  id: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();
    await TrendyolAccountModel.updateOne({ _id: id }, { $set: { active } });
    changed();
    return { ok: true };
  } catch {
    return { ok: false, error: "Güncellenemedi." };
  }
}

export async function deleteTrendyolAccount(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await connectDB();
    await TrendyolAccountModel.deleteOne({ _id: id });
    changed();
    return { ok: true };
  } catch {
    return { ok: false, error: "Silinemedi." };
  }
}

// Kayıtlı hesabı yeniden dener; mağaza listesi boşsa bulup doldurur.
export async function testTrendyolAccount(
  id: string,
): Promise<{ ok: boolean; error?: string; storeIds?: number[] }> {
  try {
    await connectDB();
    const row = await TrendyolAccountModel.findById(id).lean<Row>();
    if (!row) return { ok: false, error: "Hesap bulunamadı." };
    const creds = credsFrom(row);
    if (!creds) {
      return { ok: false, error: "Kayıtlı anahtar okunamadı — API anahtarı ve şifreyi yeniden girin." };
    }
    const test = await probe(creds);
    let storeIds = row.storeIds ?? [];
    if (test.ok && storeIds.length === 0) {
      storeIds = await discoverStoreIds(creds).catch(() => []);
    }
    const error = test.ok ? "" : probeMessage(test.status, test.error);
    await TrendyolAccountModel.updateOne(
      { _id: id },
      { $set: { lastTestAt: new Date(), lastTestOk: test.ok, lastTestError: error, storeIds } },
    );
    changed();
    return test.ok ? { ok: true, storeIds } : { ok: false, error };
  } catch (err) {
    console.error("[testTrendyolAccount]", err);
    return { ok: false, error: "Test edilemedi." };
  }
}

// .env'deki eski tek hesabı Ayarlar'a taşır (bir kez). Sonrasında .env'deki
// Trendyol anahtarları kullanılmaz; silinebilir.
export async function importEnvTrendyolAccount(
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.TRENDYOL_API_KEY;
  const secret = process.env.TRENDYOL_API_SECRET;
  const supplierId = process.env.TRENDYOL_SUPPLIER_ID?.trim();
  if (!supplierId || !key || !secret) {
    return { ok: false, error: ".env'de TRENDYOL_SUPPLIER_ID / API_KEY / API_SECRET yok." };
  }
  const env = envAccount();
  return saveTrendyolAccount({
    name: name.trim() || "Trendyol",
    supplierId,
    apiKey: key,
    apiSecret: secret,
    storeIds: (env?.storeIds ?? []).join(","),
    color: "orange",
  });
}

// Filtre/etiket için aktif işletme listesi (gizli bilgi içermez).
export interface TrendyolAccountOption {
  supplierId: string;
  name: string;
  color: string;
}

export async function getTrendyolAccountOptions(): Promise<TrendyolAccountOption[]> {
  try {
    const list = await getAllTrendyolAccounts();
    return list.map((a) => ({ supplierId: a.supplierId, name: a.name, color: a.color }));
  } catch {
    return [];
  }
}
