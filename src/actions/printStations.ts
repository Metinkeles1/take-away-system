"use server";

import { getMenuCategories } from "@/actions/menuCategories";
import { listPrintAgentDevices } from "@/lib/printAgent/agent";
import { AGENT_ONLINE_MS } from "@/lib/printAgent/constants";
import {
  queueOrderStations,
  queueStationTest,
  readStationConfig,
  writeStationConfig,
} from "@/lib/printAgent/stations";
import { MAX_STATIONS, type PrintStation, type PrintStationConfig } from "@/lib/printAgent/stationTypes";
import type { MenuCategory } from "@/types";

export type StationDeviceRow = {
  deviceId: string;
  host: string;
  online: boolean;
  printers: string[];
};

export type StationSettings = {
  config: PrintStationConfig;
  devices: StationDeviceRow[];
  categories: MenuCategory[];
};

type Result = { ok: boolean; error?: string };

export async function getStationSettings(): Promise<StationSettings> {
  const [config, devices, categories] = await Promise.all([
    readStationConfig(),
    listPrintAgentDevices(),
    getMenuCategories().catch(() => []),
  ]);
  const now = Date.now();
  return {
    config,
    categories,
    devices: devices
      .filter((d) => !d.uninstallRequestedAt)
      .map((d) => ({
        deviceId: d.deviceId,
        host: d.host || "Bilgisayar",
        online: !!d.lastSeenAt && now - d.lastSeenAt.getTime() < AGENT_ONLINE_MS,
        printers: d.printers,
      })),
  };
}

const cleanId = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);

export async function saveStationSettings(input: PrintStationConfig): Promise<Result> {
  try {
    if (!Array.isArray(input.stations) || input.stations.length > MAX_STATIONS) {
      return { ok: false, error: `En fazla ${MAX_STATIONS} istasyon` };
    }
    const knownDevices = new Set((await listPrintAgentDevices()).map((d) => d.deviceId));
    const seenIds = new Set<string>();
    const seenCats = new Set<string>();
    const stations: PrintStation[] = [];
    for (const s of input.stations) {
      const name = String(s.name ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
      if (!name) return { ok: false, error: "İstasyon adı boş olamaz" };
      const id = cleanId(String(s.id ?? "")) || `st${stations.length + 1}`;
      if (seenIds.has(id)) return { ok: false, error: "İstasyon kimliği tekrar ediyor" };
      seenIds.add(id);
      // Bir kategori yalnız bir istasyona gider (ilk seçen kalır).
      const categories = (Array.isArray(s.categories) ? s.categories : [])
        .map(String)
        .filter((c) => c && !seenCats.has(c));
      categories.forEach((c) => seenCats.add(c));
      stations.push({
        id,
        name,
        categories,
        deviceId: knownDevices.has(s.deviceId) ? s.deviceId : "",
        printerName: String(s.printerName ?? "").slice(0, 120),
      });
    }

    const prev = await readStationConfig();
    const enabled = !!input.enabled;
    await writeStationConfig({
      enabled,
      // Yeni açıldıysa önceden gelmiş platform siparişleri istasyona basılmasın.
      enabledAt: enabled && !prev.enabled ? new Date().toISOString() : prev.enabledAt,
      fallbackStationId: seenIds.has(input.fallbackStationId) ? input.fallbackStationId : "",
      stations,
    });
    return { ok: true };
  } catch (err) {
    console.error("[saveStationSettings]", err);
    return { ok: false, error: "Ayar kaydedilemedi" };
  }
}

// Kayıtlı ayardaki istasyona deneme fişi (≤20 sn).
export async function testStation(stationId: string): Promise<Result> {
  try {
    const cfg = await readStationConfig();
    const s = cfg.stations.find((x) => x.id === stationId);
    if (!s) return { ok: false, error: "Önce kaydedin" };
    if (!s.deviceId) return { ok: false, error: "Bu istasyona bilgisayar seçilmedi" };
    await queueStationTest(s);
    return { ok: true };
  } catch (err) {
    console.error("[testStation]", err);
    return { ok: false, error: "Deneme fişi gönderilemedi" };
  }
}

// Panel "Tamamla + Yazdır": kasa fişi tarayıcıdan, istasyon fişleri programdan.
// Ayar kapalıysa hiçbir şey yapmaz.
export async function sendOrderToStations(orderId: string): Promise<Result & { queued?: number }> {
  try {
    const queued = await queueOrderStations(orderId);
    return { ok: true, queued };
  } catch (err) {
    console.error("[sendOrderToStations]", err);
    return { ok: false, error: "Mutfak fişleri gönderilemedi" };
  }
}
