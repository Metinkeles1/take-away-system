import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt } from "lucide-react";
import { type Voucher } from "@/types";
import { formatPeriodLabel } from "@/lib/period";
import { VoucherRow } from "./VoucherRow";

interface VoucherListProps {
  isLoading: boolean;
  vouchers: Voucher[];
  period: string;
  onTogglePaid: (v: Voucher) => void;
  onDelete: (v: Voucher) => void;
  onPrint: (v: Voucher) => void;
  onEdit: (v: Voucher) => void;
}

export function VoucherList({
  isLoading,
  vouchers,
  period,
  onTogglePaid,
  onDelete,
  onPrint,
  onEdit,
}: VoucherListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg border p-3 flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (vouchers.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Receipt className="mb-4 h-14 w-14 opacity-20" />
          <p className="text-base font-medium">
            {formatPeriodLabel(period)} döneminde fiş yok
          </p>
          <p className="mt-1 text-xs">İlk fişi eklemek için sağ üstteki butonu kullan</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {vouchers.map((v) => (
        <VoucherRow
          key={v.id}
          voucher={v}
          onTogglePaid={onTogglePaid}
          onDelete={onDelete}
          onPrint={onPrint}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
