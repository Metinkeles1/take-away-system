import { after, NextRequest, NextResponse } from "next/server";
import {
  agentWatchInfo,
  authPrintAgent,
  claimPrintJobs,
  deleteDevice,
  isValidDeviceId,
  readAgentScript,
  runIntake,
  touchDevice,
} from "@/lib/printAgent/agent";
import { syncTrendyolCourierPackages } from "@/actions/trendyolCourier";
import { pusherPublicInfo } from "@/lib/pusher/server";

// Kasadaki "Trendyol Yazıcı" programının yoklaması: dakikada bir + Trendyol'da
// yeni paket görünce (urgent) + Pusher dürtünce.
//   POST /api/print-agent/poll   Header: "Authorization: Bearer <bağlantı anahtarı>"
//   Gövde: { deviceId, host?, version?, printers?: string[], urgent?: boolean }
//   Yanıt: { ok: true, jobs: [{ id, lines }], printerName, scriptHash, intervalSec,
//            handled, watch, pusher }
//          ya da { uninstall: true } → program kendini kaldırır.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const cfg = await authPrintAgent(req.headers.get("authorization"));
  if (!cfg) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });

  let body: { deviceId?: unknown; host?: unknown; version?: unknown; printers?: unknown; urgent?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* boş gövde */
  }
  if (!isValidDeviceId(body.deviceId)) {
    return NextResponse.json({ error: "deviceId gerekli" }, { status: 400 });
  }

  const device = await touchDevice(body.deviceId, {
    host: typeof body.host === "string" ? body.host.slice(0, 80) : undefined,
    version: typeof body.version === "string" ? body.version.slice(0, 64) : undefined,
    printers: Array.isArray(body.printers)
      ? body.printers
          .filter((p): p is string => typeof p === "string")
          .slice(0, 30)
          .map((p) => p.slice(0, 120))
      : undefined,
  });

  // Ayarlar'dan "Kaldır" denmiş → program kendini kaldırır, kayıt silinir.
  if (device.uninstallRequestedAt) {
    await deleteDevice(device.deviceId);
    return NextResponse.json({ ok: true, uninstall: true });
  }

  let handled = false;
  try {
    const r = await runIntake(cfg, { urgent: body.urgent === true });
    handled = r.handled;
    const { accepted } = r;
    // Kabul edilen paketler "Picking"e geçti → panel/kurye deposunu tazele.
    if (accepted > 0) after(() => syncTrendyolCourierPackages().catch(() => undefined));
  } catch (err) {
    console.error("[print-agent intake]", err);
  }

  const [jobs, script, watch] = await Promise.all([
    claimPrintJobs(device),
    readAgentScript().catch(() => null),
    agentWatchInfo(cfg).catch(() => null),
  ]);

  return NextResponse.json({
    ok: true, // kurulum bununla gerçekten bu siteye ulaştığını doğrular
    jobs,
    printerName: device.printerName,
    scriptHash: script?.hash ?? "",
    // Güncel program Trendyol'a kendi bakar → site yalnız dakikada bir. Eski sürüm
    // (güncelleme henüz inmediyse) bakamaz → eskisi gibi 20 sn'de bir sorsun.
    intervalSec: script && body.version === script.hash ? 60 : 20,
    handled, // false → yeni paketi birkaç sn sonra yeniden bildir
    watch,
    pusher: pusherPublicInfo(),
  });
}
