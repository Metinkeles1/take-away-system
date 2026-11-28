import "server-only";
import Pusher from "pusher";
import { ORDERS_CHANNEL, ORDERS_EVENT, PRINT_AGENT_CHANNEL, PRINT_AGENT_EVENT } from "./constants";

// Lazy singleton — env eksikse null döner ve sistem polling'le çalışmaya
// devam eder (Pusher zorunlu bağımlılık değil, "varsa anlık" iyileştirmesi).
let pusher: Pusher | null = null;
let triedInit = false;

function getPusher(): Pusher | null {
  if (triedInit) return pusher;
  triedInit = true;
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) {
    console.warn("[pusher] env eksik — gerçek zamanlı bildirim devre dışı, polling devam");
    return null;
  }
  pusher = new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    useTLS: true,
  });
  return pusher;
}

// "Siparişlerde değişiklik oldu" sinyali — best-effort, hata sistemi bozmaz.
export async function notifyOrdersChanged(reason?: string): Promise<void> {
  const p = getPusher();
  if (!p) return;
  try {
    await p.trigger(ORDERS_CHANNEL, ORDERS_EVENT, {
      reason: reason ?? null,
      at: Date.now(),
    });
  } catch (err) {
    console.warn("[pusher] trigger başarısız:", err);
  }
}

// Kasa programlarını dürt — bir sonraki dakikalık yoklamayı beklemeden siteye
// sorsunlar. Best-effort: ulaşmazsa program yine dakikada bir sorar.
export async function notifyPrintAgents(): Promise<void> {
  const p = getPusher();
  if (!p) return;
  try {
    await p.trigger(PRINT_AGENT_CHANNEL, PRINT_AGENT_EVENT, { at: Date.now() });
  } catch (err) {
    console.warn("[pusher] print-agent trigger başarısız:", err);
  }
}

// Programın bağlanacağı herkese açık bilgiler (gizli anahtar değil).
export function pusherPublicInfo(): { key: string; cluster: string; channel: string; event: string } | null {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY ?? process.env.PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? process.env.PUSHER_CLUSTER;
  if (!key || !cluster) return null;
  return { key, cluster, channel: PRINT_AGENT_CHANNEL, event: PRINT_AGENT_EVENT };
}
