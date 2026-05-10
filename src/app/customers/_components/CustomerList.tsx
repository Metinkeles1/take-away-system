import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Plus } from "lucide-react";
import { type SavedCustomer } from "@/types";
import { CustomerCard } from "./CustomerCard";

interface CustomerListProps {
  isLoading: boolean;
  customers: SavedCustomer[];
  searchQuery: string;
  onEdit: (c: SavedCustomer) => void;
  onDelete: (c: SavedCustomer) => void;
  onAdd: () => void;
}

export function CustomerList({
  isLoading,
  customers,
  searchQuery,
  onEdit,
  onDelete,
  onAdd,
}: CustomerListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rounded-lg border p-4 flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Users className="mb-4 h-16 w-16 opacity-20" />
          <p className="text-lg font-medium">
            {searchQuery ? "Müşteri bulunamadı" : "Henüz müşteri yok"}
          </p>
          <p className="mt-1 text-sm">
            {searchQuery
              ? "Farklı bir arama terimi deneyin"
              : "İlk müşteriyi eklemek için butona tıklayın"}
          </p>
          {!searchQuery && (
            <Button className="mt-4" onClick={onAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Yeni Müşteri Ekle
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {customers.map((customer) => (
        <CustomerCard
          key={customer.id}
          customer={customer}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
