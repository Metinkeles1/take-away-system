import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type SavedCustomer } from "@/types";
import { formatDate, formatPhone } from "@/lib/utils";
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
  onEdit: (customer: SavedCustomer) => void;
  onDelete: (customer: SavedCustomer) => void;
}

export const CustomerCard = memo(function CustomerCard({
  customer,
  onEdit,
  onDelete,
}: CustomerCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base truncate">{customer.name}</p>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span>{formatPhone(customer.phone)}</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {customer.address}
              {customer.addressDetail && ` - ${customer.addressDetail}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="hidden sm:flex gap-1">
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
