import { type SavedCustomer } from "@/types";

// Google Contacts'ın beklediği tam başlık şeması. Sütun sayısı/sırası birebir
// eşleşmeli — yoksa Drive Contacts içe aktarmayı reddediyor.
const GOOGLE_HEADER = [
  "First Name",
  "Middle Name",
  "Last Name",
  "Phonetic First Name",
  "Phonetic Middle Name",
  "Phonetic Last Name",
  "Name Prefix",
  "Name Suffix",
  "Nickname",
  "File As",
  "Organization Name",
  "Organization Title",
  "Organization Department",
  "Birthday",
  "Notes",
  "Photo",
  "Labels",
  "Phone 1 - Label",
  "Phone 1 - Value",
].join(",");

// Telefonu E.164'e çevir: 5XXXXXXXXX → +905XXXXXXXXX, 90XXXXXXXXXX → +90...
function normalizePhone(p: string): string {
  if (!p) return "";
  const trimmed = p.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/\s+/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("5")) return `+90${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+90${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("90")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

// "First Name" → kullanıcının ad alanı; ad telefonla aynıysa adresi kullan
// (uygulamada müşteri kaydederken çoğu zaman name=phone setleniyor).
function buildFirstName(c: SavedCustomer): string {
  const nameDigits = c.name.replace(/\D/g, "");
  const phoneDigits = c.phone.replace(/\D/g, "");
  const nameIsPhone = nameDigits.length > 0 && nameDigits === phoneDigits;

  if (c.name && c.name.trim() && !nameIsPhone) return c.name.trim();
  if (c.address && c.address.trim()) return c.address.trim();
  return phoneDigits ? `Müşteri ${phoneDigits.slice(-4)}` : "Müşteri";
}

// Adres + sipariş sayısı Notes'a — Google Contacts'ta arama yapılabilen alan
function buildNotes(c: SavedCustomer): string {
  const parts: string[] = [];
  // First Name adres değilse adresi de Notes'a koy (yedek)
  const firstName = buildFirstName(c);
  if (c.address && c.address.trim() && c.address.trim() !== firstName) {
    parts.push(c.address.trim());
  }
  if (c.addressDetail && c.addressDetail.trim()) parts.push(c.addressDetail.trim());
  if (c.orderCount > 0) parts.push(`Sipariş sayısı: ${c.orderCount}`);
  return parts.join(" · ");
}

export function exportCustomersToCsv(customers: SavedCustomer[]): void {
  const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const empty = esc("");

  const rows = customers.map((c) => {
    const firstName = buildFirstName(c);
    const notes = buildNotes(c);
    const phone = normalizePhone(c.phone);
    return [
      esc(firstName),       // First Name
      empty,                // Middle Name
      empty,                // Last Name
      empty,                // Phonetic First Name
      empty,                // Phonetic Middle Name
      empty,                // Phonetic Last Name
      empty,                // Name Prefix
      empty,                // Name Suffix
      empty,                // Nickname
      empty,                // File As
      empty,                // Organization Name
      empty,                // Organization Title
      empty,                // Organization Department
      empty,                // Birthday
      esc(notes),           // Notes
      empty,                // Photo
      esc("* myContacts"),  // Labels
      esc("Mobile"),        // Phone 1 - Label
      esc(phone),           // Phone 1 - Value
    ].join(",");
  });

  // BOM (﻿) Excel/Sheets'in UTF-8'i doğru algılaması için
  const csv = "﻿" + [GOOGLE_HEADER, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `musteriler_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
