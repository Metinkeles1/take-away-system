import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Plus } from "lucide-react";
import { type Corporate } from "@/types";
import { type CorporateWithBalance } from "@/actions/corporate";
import { CorporateCard } from "./CorporateCard";

interface CorporateListProps {
  isLoading: boolean;
  corporates: CorporateWithBalance[];
  searchQuery: string;
  onEdit: (c: Corporate) => void;
  onDelete: (c: Corporate) => void;
  onAdd: () => void;
}

export function CorporateList({
  isLoading,
  corporates,
  searchQuery,
  onEdit,
  onDelete,
  onAdd,
}: CorporateListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rounded-lg border p-4 flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  if (corporates.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Building2 className="mb-4 h-16 w-16 opacity-20" />
          <p className="text-lg font-medium">
            {searchQuery ? "Kurum bulunamadı" : "Henüz kurumsal müşteri yok"}
          </p>
          <p className="mt-1 text-sm">
            {searchQuery
              ? "Farklı bir arama terimi deneyin"
              : "İlk kurumsal müşteriyi eklemek için butona tıklayın"}
          </p>
          {!searchQuery && (
            <Button className="mt-4" onClick={onAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Yeni Kurum Ekle
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {corporates.map((c) => (
        <CorporateCard key={c.id} corp={c} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}
