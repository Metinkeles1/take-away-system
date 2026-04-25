"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPhone } from "@/lib/utils";
import type { Order } from "@/types";
import { User, Phone, MapPin } from "lucide-react";
import { memo } from "react";

interface Props {
  customer: Order["customer"];
}

const CustomerInfoCard = memo(function CustomerInfoCard({ customer }: Props) {
  const fullAddress = [
    customer.district,
    customer.address,
    customer.addressDetail,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Müşteri Bilgileri</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
        <div className="flex items-start gap-2">
          <User className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Ad Soyad</p>
            <p className="font-medium">{customer.name}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Phone className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Telefon</p>
            <p className="font-medium">{formatPhone(customer.phone)}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 sm:col-span-2">
          <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Adres</p>
            <p className="font-medium">{fullAddress}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

export default CustomerInfoCard;
