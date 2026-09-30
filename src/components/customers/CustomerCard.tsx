import { memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type SavedCustomer } from "@/types";
import { formatDate, formatPhone } from "@/lib/utils";
import { customerSearchRegex } from "@/lib/customers/searchPattern";
import {
  User,
  Phone,
  MapPin,
  ShoppingBag,
  Pencil,
  Trash2,
} from "lucide-react";

interface CustomerCardProps {
  customer: SavedCustomer;
  searchQuery?: string;
  onEdit: (customer: SavedCustomer) => void;
  onDelete: (customer: SavedCustomer) => void;
  onViewHistory: (customer: SavedCustomer) => void;
}

export const CustomerCard = memo(function CustomerCard({
  customer,
  searchQuery,
  onEdit,
  onDelete,
  onViewHistory,
}: CustomerCardProps) {
  // Tüm adresler alt alta: tek adres gösterilince (ör. Tekvin) aynı numaranın
  // öbür adresi (ör. Süleyman Şah) numarayla aransa da görünmüyordu. Sıra:
  // aramaya uyan adres → varsayılan → diğerleri.
  const addressLines = useMemo(() => {
    const list = customer.addresses.length
      ? customer.addresses
      : [{ address: customer.address, addressDetail: customer.addressDetail }];
    const q = searchQuery?.trim();
    const rx = q ? customerSearchRegex(q) : null;
    const rank = (a: { address: string; addressDetail?: string }) =>
      rx?.test(a.address)
        ? 0
        : a.address === customer.address && a.addressDetail === customer.addressDetail
          ? 1
          : 2;
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [searchQuery, customer]);
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User className="h-5 w-5" />
        </div>
        <button
          type="button"
          onClick={() => onViewHistory(customer)}
          className="flex-1 min-w-0 text-left cursor-pointer rounded-md -m-1 p-1 hover:bg-muted/50 transition-colors"
        >
          <p className="font-semibold text-base truncate">{customer.name}</p>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span>{formatPhone(customer.phone)}</span>
          </div>
          {addressLines.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {a.address}
                {a.addressDetail && ` - ${a.addressDetail}`}
              </span>
            </div>
          ))}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="secondary"
            className="hidden sm:flex gap-1 cursor-pointer hover:bg-secondary/80"
            onClick={() => onViewHistory(customer)}
          >
            <ShoppingBag className="h-3 w-3" />
            {customer.orderCount} sipariş
          </Badge>
          <span className="hidden md:block text-xs text-muted-foreground whitespace-nowrap">
            {formatDate(customer.updatedAt)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(customer)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(customer)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
