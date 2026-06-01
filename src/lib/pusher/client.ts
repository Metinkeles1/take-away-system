"use client";

import PusherClient from "pusher-js";
import { ORDERS_CHANNEL, ORDERS_EVENT } from "./constants";

export { ORDERS_CHANNEL, ORDERS_EVENT };

// Tarayıcı tarafı tekil bağlantı — tüm sayfalar aynı WebSocket'i paylaşsın.
let client: PusherClient | null = null;

export function getPusherClient(): PusherClient | null {
  if (typeof window === "undefined") return null;
  if (client) return client;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) return null; // env yoksa sessizce devre dışı (polling yedek)
  client = new PusherClient(key, { cluster });
  return client;
}

// Siparişlerdeki değişikliği dinle. Dönüş fonksiyonu cleanup içindir.
// Bağlantı tekil olduğu için sadece kanal aboneliğini bırakır, soketi kapatmaz.
export function subscribeOrders(onChange: () => void): () => void {
  const c = getPusherClient();
  if (!c) return () => {};
  const channel = c.subscribe(ORDERS_CHANNEL);
  channel.bind(ORDERS_EVENT, onChange);
  return () => {
    channel.unbind(ORDERS_EVENT, onChange);
  };
}
