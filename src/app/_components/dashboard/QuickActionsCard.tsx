import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, ClipboardList } from "lucide-react";
import { type Order } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { RelativeTime } from "@/components/RelativeTime";

interface QuickActionsCardProps {
  isLoading: boolean;
  recentOrders: Order[];
}

export function QuickActionsCard({ isLoading, recentOrders }: QuickActionsCardProps) {
  const router = useRouter();

  return (
    <Card className="flex flex-col lg:flex-1 lg:min-h-0">
      <CardHeader className="shrink-0 pb-3">
        <CardTitle className="text-base">Hızlı İşlemler</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-4 flex-1 lg:min-h-0">
        <Button
          className="w-full justify-start"
          onClick={() => router.push("/orders/new")}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Yeni Sipariş Al
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => router.push("/orders")}
        >
          <ClipboardList className="mr-2 h-4 w-4" />
          Tüm Siparişler
        </Button>
        <Separator />
        <div className="flex items-center justify-between shrink-0">
          <div className="text-sm font-medium text-muted-foreground">Son Siparişler</div>
          {recentOrders.length > 0 && (
            <>
              <span className="text-[10px] text-muted-foreground/70 lg:hidden">
                son {Math.min(recentOrders.length, 5)}
              </span>
              <span className="text-[10px] text-muted-foreground/70 hidden lg:inline">
                son {recentOrders.length}
              </span>
            </>
          )}
        </div>
        <div className="flex-1 lg:min-h-0 lg:overflow-y-auto scrollbar-hide -mr-2 pr-2">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md p-2"
                >
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <div className="space-y-1.5 items-end flex flex-col">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Henüz sipariş yok
            </p>
          ) : (
            <div className="flex flex-col gap-1 [&>*:nth-child(n+6)]:hidden lg:[&>*:nth-child(n+6)]:flex">
              {recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-center justify-between rounded-md p-2 text-sm transition-colors hover:bg-accent shrink-0"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">#{order.orderNumber}</span>
                    <span className="ml-2 text-muted-foreground truncate">
                      {order.customer.name}
                    </span>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="font-medium">{formatCurrency(order.total)}</div>
                    <div className="text-xs text-muted-foreground">
                      <RelativeTime date={order.createdAt} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
