import { type SavedCustomer } from "@/types";

export function exportCustomersToCsv(customers: SavedCustomer[]): void {
  const header = "Ad Soyad,Telefon,Adres,Adres Detay,Sipariş Sayısı";
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = customers.map((c) =>
    [
      escape(c.name),
      escape(c.phone),
      escape(c.address),
      escape(c.addressDetail ?? ""),
      c.orderCount,
    ].join(","),
  );
  const csv = "﻿" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `musteriler_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
