"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getCorporatesWithBalance,
  searchCorporates,
  type CorporateWithBalance,
} from "@/actions/corporate";
import { type Corporate } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";
import { CorporateList } from "./_components/CorporateList";
import { CorporateFormDialog } from "./_components/CorporateFormDialog";
import { DeleteCorporateDialog } from "./_components/DeleteCorporateDialog";

export default function CorporatePage() {
  const [corporates, setCorporates] = useState<CorporateWithBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editing, setEditing] = useState<Corporate | null>(null);
  const [deleting, setDeleting] = useState<Corporate | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getCorporatesWithBalance();
      setCorporates(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);
      if (!query.trim()) {
        load();
        return;
      }
      setIsLoading(true);
      try {
        const data = await searchCorporates(query);
        // search result has no openBalance — render with 0
        setCorporates(data.map((c) => ({ ...c, openBalance: 0 })));
      } finally {
        setIsLoading(false);
      }
    },
    [load],
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleOpenAdd = useCallback(() => setShowAddDialog(true), []);
  const handleOpenEdit = useCallback((c: Corporate) => setEditing(c), []);
  const handleOpenDelete = useCallback((c: Corporate) => setDeleting(c), []);

  const totalOpen = corporates.reduce((sum, c) => sum + c.openBalance, 0);

  return (
    <main className="h-full flex flex-col px-4 pt-4 pb-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 overflow-hidden">
      <div className="mb-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kurumsal Müşteriler</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {corporates.length} işletme
            {totalOpen > 0 && (
              <>
                {" · "}
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  {formatCurrency(totalOpen)} açık bakiye
                </span>
              </>
            )}
          </p>
        </div>
        <Button onClick={handleOpenAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Yeni Kurum
        </Button>
      </div>

      <div className="relative mb-4 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="İsim veya telefon ile ara..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pt-px px-px pb-2">
        <CorporateList
          isLoading={isLoading}
          corporates={corporates}
          searchQuery={searchQuery}
          onEdit={handleOpenEdit}
          onDelete={handleOpenDelete}
          onAdd={handleOpenAdd}
        />
      </div>

      <CorporateFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={load}
      />
      <CorporateFormDialog
        editing={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSuccess={load}
      />
      <DeleteCorporateDialog
        corp={deleting}
        onClose={() => setDeleting(null)}
        onSuccess={load}
      />
    </main>
  );
}
