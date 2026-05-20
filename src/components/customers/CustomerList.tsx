"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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

const ROW_HEIGHT = 96; // CustomerCard + 12px gap
const OVERSCAN = 6;

export function CustomerList({
  isLoading,
  customers,
  searchQuery,
  onEdit,
  onDelete,
  onAdd,
}: CustomerListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: customers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto scrollbar-hide pt-px px-px pb-2">
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
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="h-full overflow-y-auto scrollbar-hide pt-px px-px pb-2">
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
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="h-full overflow-y-auto scrollbar-hide pt-px px-px pb-2"
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const customer = customers[virtualRow.index];
          return (
            <div
              key={customer.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                paddingBottom: 12,
              }}
            >
              <CustomerCard customer={customer} onEdit={onEdit} onDelete={onDelete} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
