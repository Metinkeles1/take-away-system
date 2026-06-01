"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPhone } from "@/lib/utils";
import type { Order } from "@/types";
import { User, Phone, MapPin, Navigation } from "lucide-react";
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

  const geo = customer.geo;
  // Ücretsiz OpenStreetMap embed (API key gerekmez) — pini gömülü haritada gösterir.
  const d = 0.0025; // ~250m'lik yakın çerçeve
  const embedUrl = geo
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${geo.lng - d},${geo.lat - d},${geo.lng + d},${geo.lat + d}&layer=mapnik&marker=${geo.lat},${geo.lng}`
    : null;
  const mapsUrl = geo
    ? `https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lng}`
    : null;

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
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Adres</p>
            <p className="font-medium">{fullAddress}</p>
          </div>
        </div>

        {/* Kurye teslimatta pinlediyse kesin konumu haritada göster */}
        {geo && embedUrl && mapsUrl && (
          <div className="sm:col-span-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                <MapPin className="h-3 w-3" /> Konum pinli
              </span>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
              >
                <Navigation className="h-3.5 w-3.5" /> Google Maps&apos;te aç
              </a>
            </div>
            <div className="overflow-hidden rounded-lg border">
              <iframe
                title="Teslimat konumu"
                src={embedUrl}
                className="h-44 w-full"
                loading="lazy"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default CustomerInfoCard;
