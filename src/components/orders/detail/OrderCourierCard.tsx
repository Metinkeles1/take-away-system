"use client";

import { memo, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bike } from "lucide-react";
import { toast } from "sonner";
import { getActiveCouriers, type Courier } from "@/actions/couriers";

const UNASSIGNED = "__none__";

// Aktif kurye listesini modül seviyesinde kısa süre (60 sn) önbellekle — her
// sipariş detayı açılışında DB'ye tekrar gitmesin. Kurye listesi nadir değişir.
const COURIERS_TTL = 60_000;
let couriersCache: { at: number; data: Courier[] } | null = null;

async function getCachedActiveCouriers(): Promise<Courier[]> {
  if (couriersCache && Date.now() - couriersCache.at < COURIERS_TTL) {
    return couriersCache.data;
  }
  const data = await getActiveCouriers();
  couriersCache = { at: Date.now(), data };
  return data;
}

interface Props {
  courier?: string;
  onAssign: (courier: string | null) => void;
}

// Admin'in siparişe kurye atadığı / değiştirdiği kart. Kuryenin kendi
// üstlenmesinden bağımsız — son söz admin'de. Hiç kurye tanımlı değilse ve
// siparişin atanmış kuryesi de yoksa kart gizlenir (kurye sistemi kullanılmıyor).
const OrderCourierCard = memo(function OrderCourierCard({
  courier,
  onAssign,
}: Props) {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getCachedActiveCouriers().then((c) => {
      setCouriers(c);
      setLoaded(true);
    });
  }, []);

  if (loaded && couriers.length === 0 && !courier) return null;

  const value = courier ?? UNASSIGNED;
  // Atanan kurye pasifleşmiş / listede yoksa yine de seçilebilir kalsın.
  const missingActive = !!courier && !couriers.some((c) => c.name === courier);

  const handleChange = (val: string) => {
    const next = val === UNASSIGNED ? null : val;
    onAssign(next);
    toast.success(next ? `${next} atandı` : "Kurye ataması kaldırıldı");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bike className="h-4 w-4 text-lime-600" />
          Kurye
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Select value={value} onValueChange={handleChange}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Atanmadı" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Havuz (atanmadı)</SelectItem>
            {couriers.map((c) => (
              <SelectItem key={c.id} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
            {missingActive && (
              <SelectItem value={courier!}>{courier} (pasif)</SelectItem>
            )}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
});

export default OrderCourierCard;
