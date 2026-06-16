"use client";

import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PackagePlus,
  Bike,
  CheckCircle2,
  Banknote,
  Timer,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Order, PaymentMethod } from "@/types";

// Tarih + saati Istanbul saatine göre kısa biçimde gösterir (ör. "11 Haz 19:42").
function fmt(at: Date | string | undefined): string {
  if (!at) return "";
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}

// Dakikayı okunur süreye çevirir: 45 → "45 dk", 95 → "1 sa 35 dk".
export function formatDuration(min: number): string {
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} sa` : `${h} sa ${m} dk`;
}

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Nakit",
  card: "Kart",
  online: "Online",
  meal_card: "Yemek Kartı",
  iban: "IBAN",
};

interface TimelineEvent {
  at: Date;
  icon: React.ElementType;
  label: string;
  detail?: string;
  tone?: "default" | "success";
}

interface Props {
  order: Order;
}

// Sipariş ile ilgili kayıtların kronolojik dökümü: alındığı an, tahsilat
// hareketleri ve teslim (toplam teslim süresiyle). Mevcut verilerden türetilir;
// ekstra bir kayıt tablosu tutulmaz.
const OrderTimelineCard = memo(function OrderTimelineCard({ order }: Props) {
  const events: TimelineEvent[] = [];

  if (order.createdAt) {
    events.push({
      at: new Date(order.createdAt),
      icon: PackagePlus,
      label: "Sipariş alındı",
      detail: order.courier ? `Kurye: ${order.courier}` : undefined,
    });
  }

  // Açık hesaba yapılan parça parça tahsilatlar.
  for (const p of order.payments ?? []) {
    events.push({
      at: new Date(p.at),
      icon: Banknote,
      label: `Tahsilat · ${formatCurrency(p.amount)}`,
      detail: [PAYMENT_LABEL[p.method] ?? p.method, p.note]
        .filter(Boolean)
        .join(" · "),
    });
  }

  if (order.deliveredAt) {
    events.push({
      at: new Date(order.deliveredAt),
      icon: CheckCircle2,
      label: "Teslim edildi",
      detail:
        order.deliveryDurationMin != null
          ? `${formatDuration(order.deliveryDurationMin)} içinde`
          : undefined,
      tone: "success",
    });
  }

  // Kronolojik sırala (eskiden yeniye).
  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  if (events.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Timer className="h-4 w-4 text-muted-foreground" />
          Sipariş Kayıtları
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Teslim süresi öne çıkan rozet — varsa */}
        {order.deliveryDurationMin != null && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
            <Bike className="h-4 w-4 shrink-0" />
            Toplam teslim süresi: {formatDuration(order.deliveryDurationMin)}
          </div>
        )}

        <ol className="space-y-3">
          {events.map((e, i) => {
            const Icon = e.icon;
            const last = i === events.length - 1;
            return (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full " +
                      (e.tone === "success"
                        ? "bg-green-100 text-green-600"
                        : "bg-muted text-muted-foreground")
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {!last && <span className="mt-1 w-px flex-1 bg-border" />}
                </div>
                <div className="min-w-0 pb-1">
                  <p className="text-sm font-medium leading-tight">{e.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(e.at)}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
});

export default OrderTimelineCard;
