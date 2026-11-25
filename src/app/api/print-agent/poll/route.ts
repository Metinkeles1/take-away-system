import { after, NextRequest, NextResponse } from "next/server";
import {
  authPrintAgent,
  claimPrintJobs,
  deleteDevice,
  isValidDeviceId,
  readAgentScript,
  runIntake,
  touchDevice,
} from "@/lib/printAgent/agent";
import { syncTrendyolCourierPackages } from "@/actions/trendyolCourier";

// Kasadaki "Trendyol Yazıcı" programının ~20 sn'lik yoklaması.
//   POST /api/print-agent/poll   Header: "Authorization: Bearer <bağlantı anahtarı>"
//   Gövde: { deviceId, host?, version?, printers?: string[] }
//   Yanıt: { jobs: [{ id, lines }], printerName, scriptHash, intervalSec }
//          ya da { uninstall: true } → program kendini kaldırır.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const cfg = await authPrintAgent(req.headers.get("authorization"));
  if (!cfg) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });

  let body: { deviceId?: unknown; host?: unknown; version?: unknown; printers?: unknown } = {};
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
    return NextResponse.json({ uninstall: true });
  }

  try {
    const { accepted } = await runIntake(cfg);
    // Kabul edilen paketler "Picking"e geçti → panel/kurye deposunu tazele.
    if (accepted > 0) after(() => syncTrendyolCourierPackages().catch(() => undefined));
  } catch (err) {
    console.error("[print-agent intake]", err);
  }

  const [jobs, script] = await Promise.all([
    claimPrintJobs(device),
    readAgentScript().catch(() => null),
  ]);

  return NextResponse.json({
    jobs,
    printerName: device.printerName,
    scriptHash: script?.hash ?? "",
    intervalSec: 20,
  });
}
