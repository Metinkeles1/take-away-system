import { type SavedCustomer } from "@/types";
import {
  buildFirstName,
  buildNotes,
  normalizePhone,
} from "@/lib/customers/contactFields";

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

// Tüm aktarılan kişiler rehberde bu etiketle gruplanır → Google Contacts'ta
// tek tıkla hepsi seçilip silinebilir / yeniden kurulabilir.
const CONTACT_LABEL = "Paket Servis ::: * myContacts";

export function exportCustomersToCsv(
  customers: SavedCustomer[],
  fileTag = "musteriler",
): void {
  // Adres çok satırlı (Textarea) girilebildiği için içinde gizli satır sonu
  // olabilir; CSV satırını bölüp sonraki sütunları (Notes'taki bina/daire)
  // kaydırır. Önce satır sonlarını boşluğa indir, sonra tırnakla.
  const esc = (v: string) =>
    `"${(v ?? "").replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"`;
  const empty = esc("");

  // Aynı telefon iki kez yazılmasın (rehberde çift kişi olur) — ilk kayıt kalır.
  const seen = new Set<string>();
  const unique = customers.filter((c) => {
    const key = normalizePhone(c.phone);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const rows = unique.map((c) => {
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
      esc(CONTACT_LABEL),   // Labels
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
  a.download = `${fileTag}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
