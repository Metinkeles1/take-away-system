"use client";

import Link from "next/link";
import { Banknote, CreditCard, Wallet, ChevronRight } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentBreakdown } from "@/components/dashboard/PaymentBreakdown";
import { formatCurrency } from "@/lib/utils";
import { type DaySales } from "@/actions/dashboard";

interface Props {
  data: DaySales | null;
  isLoading: boolean;
  /** Gün etiketi: "Bugün" / "Dün" / "Çar 11 Haz" */
  label: string;
}

export function PaymentsTab({ data, isLoading, label }: Props) {
  const p = data?.payments;
  // Para nereye gidiyor: nakit kasada, kart/online/iban hesaba, yemek kartı ayrı.
  const cash = p?.cash ?? 0;
  const toAccount = (p?.card ?? 0) + (p?.online ?? 0) + (p?.iban ?? 0);
  const mealCard = p?.meal_card ?? 0;
  const total = cash + toAccount + mealCard;

  return (
    <div className="space-y-4">
      {/* Para akışı özeti */}
      <div className="grid gap-3 sm:grid-cols-3">
        <FlowCard
          icon={Banknote}
          tone="emerald"
          title="Nakit (kasada)"
          value={cash}
          isLoading={isLoading}
        />
        <FlowCard
          icon={CreditCard}
          tone="blue"
          title="Kart / Online (hesaba)"
          value={toAccount}
          isLoading={isLoading}
        />
        <FlowCard
          icon={Wallet}
          tone="orange"
          title="Yemek Kartı"
          hint="settlement dışı"
          value={mealCard}
          isLoading={isLoading}
          highlight
        />
      </div>

      {/* Ödeme yöntemi dağılımı */}
      <Card>
        <CardHeader>
          <CardTitle>Ödeme Yöntemi Dağılımı</CardTitle>
          <CardDescription>{label} · yönteme göre tahsilat</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <PaymentBreakdown
              data={p}
              total={total}
              totalLabel="Gün Toplamı"
              emptyText="Bu gün tahsilat yok."
            />
          )}
        </CardContent>
      </Card>

      {/* Köprüler */}
      <div className="grid gap-3 sm:grid-cols-2">
        <BridgeCard
          href="/gun-sonu"
          title="🧾 Gün Sonu Kapanışı"
          desc="Kasa sayımı + hakediş snapshot"
        />
        <BridgeCard
          href="/open-accounts"
          title="👛 Açık Hesaplar"
          desc="Veresiye / tahsil edilmemiş bakiyeler"
        />
      </div>
    </div>
  );
}

const TONES: Record<string, { bg: string; text: string; ring: string }> = {
  emerald: { bg: "bg-emerald-100", text: "text-emerald-700", ring: "" },
  blue: { bg: "bg-blue-100", text: "text-blue-700", ring: "" },
  orange: { bg: "bg-orange-100", text: "text-orange-700", ring: "ring-1 ring-orange-200" },
};

function FlowCard({
  icon: Icon,
  tone,
  title,
  hint,
  value,
  isLoading,
  highlight,
}: {
  icon: React.ElementType;
  tone: keyof typeof TONES | string;
  title: string;
  hint?: string;
  value: number;
  isLoading: boolean;
  highlight?: boolean;
}) {
  const t = TONES[tone] ?? TONES.emerald;
  return (
    <Card className={highlight ? t.ring : undefined}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-xl p-2.5 ${t.bg}`}>
          <Icon className={`size-5 ${t.text}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {title}
            {hint && <span className={`ml-1 ${t.text}`}>· {hint}</span>}
          </p>
          {isLoading ? (
            <Skeleton className="mt-1 h-6 w-20" />
          ) : (
            <p className={`mt-0.5 text-xl font-semibold tabular-nums ${t.text}`}>
              {formatCurrency(value)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BridgeCard({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
