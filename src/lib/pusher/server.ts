import "server-only";
import Pusher from "pusher";
import { ORDERS_CHANNEL, ORDERS_EVENT } from "./constants";

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
