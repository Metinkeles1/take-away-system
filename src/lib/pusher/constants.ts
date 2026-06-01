// Pusher kanal/olay isimleri — hem sunucu (trigger) hem tarayıcı (subscribe)
// aynı sabitleri kullansın diye tek yerde. Sunucu SDK'sını client'a sızdırmaz.

export const ORDERS_CHANNEL = "orders";
// Tek olay: "siparişlerde değişiklik oldu, yeniden çek". Payload taşımıyoruz —
// client kendi kaynağından (getOrders/getCourierOrders) taze veriyi okur, böylece
// merge/senkron karmaşası olmaz.
export const ORDERS_EVENT = "changed";
