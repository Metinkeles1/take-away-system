import { memo, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCustomerDataCheck } from "@/actions/customers";
import { type CustomerCheckPerson, type CustomerDataCheck } from "@/types";
import { CheckCircle2, MapPin, ShieldCheck } from "lucide-react";

interface CustomerDataCheckDialogProps {
  open: boolean;
  onClose: () => void;
}

// Numara = müşteri kimliği (tekil), bir numaranın çok adresi olabilir; aynı
// adreste farklı numaralar serbest (ev/iş yeri). Bu pencere üç durumu gösterir.
export const CustomerDataCheckDialog = memo(function CustomerDataCheckDialog({
  open,
  onClose,
}: CustomerDataCheckDialogProps) {
  const [data, setData] = useState<CustomerDataCheck | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getCustomerDataCheck()
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setFailed(false);
        }
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Kayıt Kontrolü
          </DialogTitle>
          <DialogDescription>
            Her numara tek müşteridir ve birden fazla adresi olabilir. Aynı
            adreste farklı numaralar olabilir (ev, iş yeri).
          </DialogDescription>
        </DialogHeader>

        {failed ? (
          <p className="px-6 py-10 text-center text-sm text-destructive">
            Kontrol yüklenemedi
          </p>
        ) : !data ? (
          <div className="px-6 py-4 space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <Tabs
            defaultValue={data.duplicatePhones.length > 0 ? "dup" : "multi"}
            className="flex-1 min-h-0 px-6 pt-4"
          >
            <TabsList className="w-full">
              <TabsTrigger value="dup">
                Çift kayıt
                <CountBadge n={data.duplicatePhones.length} alert />
              </TabsTrigger>
              <TabsTrigger value="multi">
                Çok adresli
                <CountBadge n={data.multiAddress.length} />
              </TabsTrigger>
              <TabsTrigger value="shared">
                Ortak adres
                <CountBadge n={data.sharedAddresses.length} />
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dup" className="min-h-0 overflow-y-auto pb-6 space-y-2">
              {data.duplicatePhones.length === 0 ? (
                <Empty text="Aynı numaraya açılmış ikinci kayıt yok" ok />
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Aynı numara birden fazla kayıtta: adresler ve sipariş sayısı
                    bölünmüş durumda; bu kayıtlar tek kayıtta birleştirilmeli.
                  </p>
                  {data.duplicatePhones.map((g) => (
                    <div key={g.phone} className="rounded-lg border p-3">
                      <p className="font-semibold text-sm tabular-nums">{g.phone}</p>
                      <ul className="mt-1 space-y-0.5">
                        {g.records.map((r) => (
                          <li
                            key={r.id}
                            className="flex items-baseline justify-between gap-2 text-sm"
                          >
                            <span className="min-w-0 truncate">{r.name}</span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                              {r.orderCount} sipariş · {r.addressCount} adres
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </>
              )}
            </TabsContent>

            <TabsContent value="multi" className="min-h-0 overflow-y-auto pb-6 space-y-2">
              {data.multiAddress.length === 0 ? (
                <Empty text="Birden fazla adresi olan müşteri yok" />
              ) : (
                data.multiAddress.map((c) => (
                  <div key={c.id} className="rounded-lg border p-3">
                    <PersonLine person={c} />
                    <ul className="mt-2 space-y-1">
                      {c.addresses.map((a, i) => (
                        <li key={i} className="flex items-start justify-between gap-2 text-sm">
                          <span className="min-w-0">
                            {a.address}
                            {a.addressDetail && (
                              <span className="text-muted-foreground"> · {a.addressDetail}</span>
                            )}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                            {a.hasPin && <MapPin className="h-3 w-3" aria-label="Pinli" />}
                            {a.useCount}×
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="shared" className="min-h-0 overflow-y-auto pb-6 space-y-2">
              {data.sharedAddresses.length === 0 ? (
                <Empty text="Farklı numaralarla kayıtlı ortak adres yok" />
              ) : (
                data.sharedAddresses.map((s, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <p className="text-sm font-medium">
                      {s.address}
                      {s.addressDetail && (
                        <span className="font-normal text-muted-foreground"> · {s.addressDetail}</span>
                      )}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {s.customers.map((c) => (
                        <li key={c.id}>
                          <PersonLine person={c} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
});

function CountBadge({ n, alert }: { n: number; alert?: boolean }) {
  return (
    <Badge
      variant={alert && n > 0 ? "destructive" : "secondary"}
      className="ml-1.5 h-5 min-w-5 px-1.5 tabular-nums"
    >
      {n}
    </Badge>
  );
}

function PersonLine({ person }: { person: CustomerCheckPerson }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="min-w-0 truncate font-medium">{person.name}</span>
      <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
        {person.phone} · {person.orderCount} sipariş
      </span>
    </div>
  );
}

function Empty({ text, ok }: { text: string; ok?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
      {ok && <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500 opacity-80" />}
      <p className="text-sm">{text}</p>
    </div>
  );
}
