"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { CorporateList } from "@/components/corporate/CorporateList";
import { CorporateFormDialog } from "@/components/corporate/CorporateFormDialog";
import { DeleteCorporateDialog } from "@/components/corporate/DeleteCorporateDialog";

const SEARCH_DEBOUNCE_MS = 220;

export default function CorporatePageClient({
  initialCorporates,
}: {
  initialCorporates: CorporateWithBalance[];
}) {
  const [corporates, setCorporates] = useState<CorporateWithBalance[]>(initialCorporates);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editing, setEditing] = useState<Corporate | null>(null);
  const [deleting, setDeleting] = useState<Corporate | null>(null);

  const isFirstRunRef = useRef(true);

  const reloadAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await getCorporatesWithBalance();
      setCorporates(data);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Debounce'lu arama: her keystroke'ta server action çağrısı yapmıyoruz —
  // kullanıcı yazmayı bırakınca tek çağrı atılır.
  useEffect(() => {
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      return;
    }

    const handle = setTimeout(async () => {
      const q = searchQuery.trim();
      setIsRefreshing(true);
      try {
        if (!q) {
          const data = await getCorporatesWithBalance();
          setCorporates(data);
        } else {
          const data = await searchCorporates(q);
          // Arama sonucunda openBalance yok — 0 göster, kullanıcı tıklayınca
          // detayda gerçek bakiye görünür.
          setCorporates(data.map((c) => ({ ...c, openBalance: 0 })));
        }
      } finally {
        setIsRefreshing(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [searchQuery]);

  const handleOpenAdd = useCallback(() => setShowAddDialog(true), []);
  const handleOpenEdit = useCallback((c: Corporate) => setEditing(c), []);
  const handleOpenDelete = useCallback((c: Corporate) => setDeleting(c), []);

  const totalOpen = corporates.reduce((sum, c) => sum + c.openBalance, 0);

  return (
    <main className="h-full flex flex-col px-4 pt-4 pb-4 md:px-6 md:pt-5 lg:px-8 lg:pt-6 overflow-hidden">
      <div className="mb-4 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
            Kurumsal Müşteriler
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground inline-flex items-center gap-2">
            <span>{corporates.length} işletme</span>
            {totalOpen > 0 && (
              <>
                <span>·</span>
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  {formatCurrency(totalOpen)} açık
                </span>
              </>
            )}
            {isRefreshing && (
              <span
                aria-hidden
                className="inline-block size-1.5 rounded-full bg-cyan-500 animate-pulse"
              />
            )}
          </p>
        </div>
        <Button onClick={handleOpenAdd} className="shrink-0">
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Yeni Kurum</span>
        </Button>
      </div>

      <div className="relative mb-4 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="İsim veya telefon ile ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pt-px px-px pb-2">
        <CorporateList
          isLoading={false}
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
        onSuccess={reloadAll}
      />
      <CorporateFormDialog
        editing={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSuccess={reloadAll}
      />
      <DeleteCorporateDialog
        corp={deleting}
        onClose={() => setDeleting(null)}
        onSuccess={reloadAll}
      />
    </main>
  );
}
