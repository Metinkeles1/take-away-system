"use client";

import { useEffect, useState } from "react";
import { getCustomerOpenAccounts } from "@/actions/orders";
import type { CustomerOpenAccounts } from "@/types";

// Telefona göre müşterinin açık hesabını (ödenmemiş siparişler) debounce ile çeker.
// Yeni sipariş panelinde hem uyarı kutusu hem basılan fiş aynı veriyi kullansın diye
// tek noktadan paylaşılır (çift sorgu olmaz). Kısa/boş telefonda anında temizler.
export function useCustomerOpenAccounts(
  phone: string,
): CustomerOpenAccounts | null {
  const [accounts, setAccounts] = useState<CustomerOpenAccounts | null>(null);

  useEffect(() => {
    const key = phone?.trim() ?? "";
    let alive = true;
    const t = setTimeout(
      async () => {
        if (key.length < 6) {
          if (alive) setAccounts(null);
          return;
        }
        try {
          const res = await getCustomerOpenAccounts(key);
          if (alive) setAccounts(res);
        } catch {
          if (alive) setAccounts(null);
        }
      },
      key.length < 6 ? 0 : 400,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [phone]);

  return accounts;
}
