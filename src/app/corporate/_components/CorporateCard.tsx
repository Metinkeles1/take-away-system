import Link from "next/link";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type Corporate } from "@/types";
import { type CorporateWithBalance } from "@/actions/corporate";
import { cn, formatCurrency, formatPhone } from "@/lib/utils";
import {
  Building2,
  Phone,
  FileText,
  Wallet,
  Pencil,
  Trash2,
  ArrowRight,
} from "lucide-react";

interface CorporateCardProps {
  corp: CorporateWithBalance;
  onEdit: (c: Corporate) => void;
  onDelete: (c: Corporate) => void;
}

export const CorporateCard = memo(function CorporateCard({
  corp,
  onEdit,
  onDelete,
}: CorporateCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-md group">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
          <Building2 className="h-5 w-5" />
        </div>

        <Link
          href={`/corporate/${corp.id}`}
          className="flex-1 min-w-0 -my-2 py-2 hover:opacity-80 transition-opacity"
        >
          <p className="font-semibold text-base truncate">{corp.name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground mt-0.5">
            {corp.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {formatPhone(corp.phone)}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5" />
              {corp.billingType === "per_person" && corp.pricePerPerson
                ? `${formatCurrency(corp.pricePerPerson)} / kişi`
                : "Menüden seçim"}
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          {corp.openBalance > 0 ? (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 gap-1 hidden sm:inline-flex"
            >
              {formatCurrency(corp.openBalance)} açık
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 hidden sm:inline-flex">
              <FileText className="h-3 w-3" />
              {corp.voucherCount} fiş
            </Badge>
          )}

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(corp)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(corp)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Link
            href={`/corporate/${corp.id}`}
            className={cn(
              "h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground",
              "hover:bg-accent hover:text-foreground transition-colors",
            )}
            title="Detay"
          >
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
});
