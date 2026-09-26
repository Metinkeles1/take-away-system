import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type CustomerAddress, type SavedCustomer } from "@/types";
import { cn, formatPhone, phoneKey } from "@/lib/utils";
import { findMatchingAddress, pickDefaultAddress } from "@/lib/customers/addresses";
import { Phone, MapPin, Building2, BookUser } from "lucide-react";
import { SectionTitle } from "./SectionTitle";
import { User } from "lucide-react";

const AVATAR_COLORS = [
  "bg-rose-100 text-rose-700",
  "bg-orange-100 text-orange-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-teal-100 text-teal-700",
  "bg-sky-100 text-sky-700",
  "bg-indigo-100 text-indigo-700",
  "bg-violet-100 text-violet-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-pink-100 text-pink-700",
];

function CustomerAvatar({ customer }: { customer: SavedCustomer }) {
  const seed = customer.phone || customer.id;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  const initial =
    customer.address.replace(/[^\p{L}]/gu, "").charAt(0).toUpperCase() || "•";
  return (
    <div
      className={cn(
        "h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-sm font-bold",
        color,
      )}
    >
      {initial}
    </div>
  );
}

// Kayıttaki isim gerçek bir isim mi (sipariş ekranı eskiden isim alanına
// telefonu yazıyordu — "5365837591" gibi kayıtlar isim olarak gösterilmesin).
function realName(c: SavedCustomer): string | null {
  if (!c.name) return null;
  return /^[\d\s()+-]+$/.test(c.name) ? null : c.name;
}

// ─── Arama normalizasyonu ──────────────────────────────────────────────────
// Operatör "sehit" yazar, kayıtta "Şehit" vardır; "atatürk 12" yazar, kayıtta
// "Atatürk Cad. No:12" vardır. Harf harf eşleştirme bunları kaçırıyordu. Artık:
// küçük harf + Türkçe karakter sadeleştirme + noktalama → boşluk, ve sorgudaki
// HER kelime metinde (sırası fark etmeksizin) geçiyorsa eşleşir.
// Karakter karakter eşleme (uzunluk korunur) → vurgulama indeksleri metne oturur.
const FOLD: Record<string, string> = {
  ş: "s", ı: "i", ğ: "g", ü: "u", ö: "o", ç: "c", â: "a", î: "i", û: "u",
};
function foldText(text: string): string {
  let out = "";
  for (const ch of text) {
    const lower = ch.toLocaleLowerCase("tr-TR");
    // "İ".toLocaleLowerCase → "i" (tek karakter); güvenlik için ilk karakteri al.
    const c = lower.length === 1 ? lower : lower.charAt(0);
    out += FOLD[c] ?? (/[\p{L}\p{N}]/u.test(c) ? c : " ");
  }
  return out;
}
function queryTokens(query: string): string[] {
  return foldText(query).split(/\s+/).filter(Boolean);
}
function matchesAllTokens(haystack: string, tokens: string[]): boolean {
  const folded = foldText(haystack);
  return tokens.length > 0 && tokens.every((t) => folded.includes(t));
}

const MARK = "bg-yellow-200 dark:bg-yellow-900 text-foreground rounded px-0.5";

// [start, end) aralıklarını <mark> ile sarar (çakışanlar birleştirilir).
function renderRanges(text: string, ranges: [number, number][]): React.ReactNode {
  if (ranges.length === 0) return text;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const parts: React.ReactNode[] = [];
  let pos = 0;
  merged.forEach(([a, b], i) => {
    if (a > pos) parts.push(text.slice(pos, a));
    parts.push(
      <mark key={i} className={MARK}>
        {text.slice(a, b)}
      </mark>,
    );
    pos = b;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}

// Metin araması vurgusu: sorgudaki her kelimenin (2+ harf) metindeki tüm geçişleri.
function highlightMatch(text: string, query: string): React.ReactNode {
  const tokens = queryTokens(query).filter((t) => t.length >= 2);
  if (tokens.length === 0) return text;
  const folded = foldText(text);
  const ranges: [number, number][] = [];
  for (const t of tokens) {
    let i = folded.indexOf(t);
    while (i !== -1) {
      ranges.push([i, i + t.length]);
      i = folded.indexOf(t, i + t.length);
    }
  }
  return renderRanges(text, ranges);
}

// Numara araması vurgusu: "7591" → "(536) 583 75 91" içindeki "75 91". Rakamlar
// üzerinden eşleşir, aradaki boşluk/parantezler vurgunun içinde kalır.
function highlightDigits(text: string, digits: string): React.ReactNode {
  if (digits.length < 3) return text;
  const pos: number[] = []; // her rakamın metindeki indeksi
  let only = "";
  for (let i = 0; i < text.length; i++) {
    if (/\d/.test(text[i])) {
      pos.push(i);
      only += text[i];
    }
  }
  const idx = only.indexOf(digits);
  if (idx === -1) return text;
  return renderRanges(text, [[pos[idx], pos[idx + digits.length - 1] + 1]]);
}

// ─── Öneri gruplama ────────────────────────────────────────────────────────
// Bir müşteri = bir grup; grup içinde varsayılan/son kullanılan adres önde,
// sonra son kullanıma göre azalan sırayla diğer adresler.

interface SuggestionGroup {
  customer: SavedCustomer;
  addresses: CustomerAddress[];
}

// Listede her satır tek bir adres (müşteri bilgisi satırın altında küçük yazı).
// Ayrı "yeni adres" satırı yok: seçilen adres düzenlenirse sipariş tamamlanınca
// sunucu onu zaten yeni adres olarak ekler.
type SuggestionRow = { customer: SavedCustomer; addr: CustomerAddress };

function sortAddresses(customer: SavedCustomer, addrs: CustomerAddress[]): CustomerAddress[] {
  const def = pickDefaultAddress(customer.addresses, customer.defaultAddressId);
  return [...addrs].sort((a, b) => {
    if (def && a.id === def.id) return -1;
    if (def && b.id === def.id) return 1;
    return +new Date(b.lastUsedAt) - +new Date(a.lastUsedAt);
  });
}

function sortGroups(groups: SuggestionGroup[]): SuggestionGroup[] {
  return [...groups]
    .sort((a, b) => {
      if (b.customer.orderCount !== a.customer.orderCount) {
        return b.customer.orderCount - a.customer.orderCount;
      }
      return +new Date(b.customer.updatedAt) - +new Date(a.customer.updatedAt);
    })
    .slice(0, 8);
}

interface CustomerSearchProps {
  address: string;
  addressDetail: string;
  phone: string;
  savedCustomers: SavedCustomer[];
  // Listeden seçilen kayıtlı adres + operatör bu adresi düzeltiyorsa
  // "yeni adres mi / kayıtlı adresi güncelle mi" seçimi.
  selectedAddressId?: string;
  updateSaved: boolean;
  onUpdateSavedChange: (value: boolean) => void;
  autoFocus?: boolean;
  onAddressChange: (value: string) => void;
  onAddressDetailChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onSelectCustomer: (c: SavedCustomer, a: CustomerAddress) => void;
}

export function CustomerSearch({
  address,
  addressDetail,
  phone,
  savedCustomers,
  selectedAddressId,
  updateSaved,
  onUpdateSavedChange,
  autoFocus,
  onAddressChange,
  onAddressDetailChange,
  onPhoneChange,
  onSelectCustomer,
}: CustomerSearchProps) {
  const [activeField, setActiveField] = useState<"address" | "phone" | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [rawHighlightedIndex, setHighlightedIndex] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addressQuery = address.trim();
  const phoneDigits = useMemo(() => phone.replace(/\D/g, ""), [phone]);
  // Adres kutusuna sadece rakam yazıldıysa (ör. son 4 hane) numara araması yap —
  // operatör hangi kutuya yazdığını düşünmek zorunda kalmasın.
  const digitQuery =
    activeField === "phone"
      ? phoneDigits
      : activeField === "address" && /^[\d\s+]+$/.test(addressQuery)
        ? addressQuery.replace(/\D/g, "")
        : "";
  const isDigitSearch = digitQuery.length >= 3;

  // ── Öneri grupları: hangi alan yazılıyorsa ona göre filtrele ───────────
  const groups = useMemo<SuggestionGroup[]>(() => {
    if (digitQuery.length >= 3) {
      const matched = savedCustomers.filter((c) =>
        c.phone.replace(/\D/g, "").includes(digitQuery),
      );
      return sortGroups(
        matched.map((c) => ({ customer: c, addresses: sortAddresses(c, c.addresses) })),
      );
    }
    if (activeField === "address" && addressQuery.length >= 2) {
      const tokens = queryTokens(addressQuery);
      const matched: SuggestionGroup[] = [];
      for (const c of savedCustomers) {
        const name = realName(c);
        const nameMatches = !!name && matchesAllTokens(name, tokens);
        // Adres + daire/kat + isim birlikte aranır: "atatürk 12 ahmet" de bulur.
        const matchingAddrs = c.addresses.filter((a) =>
          matchesAllTokens(`${a.address} ${a.addressDetail ?? ""} ${name ?? ""}`, tokens),
        );
        if (matchingAddrs.length > 0) {
          matched.push({ customer: c, addresses: sortAddresses(c, matchingAddrs) });
        } else if (nameMatches) {
          matched.push({ customer: c, addresses: sortAddresses(c, c.addresses) });
        }
      }
      return sortGroups(matched);
    }
    return [];
  }, [activeField, digitQuery, addressQuery, savedCustomers]);

  // ── Düz (klavye ile gezilebilir) satır listesi — her satır bir adres ───
  const rows = useMemo<SuggestionRow[]>(
    () => groups.flatMap((g) => g.addresses.map((a) => ({ customer: g.customer, addr: a }))),
    [groups],
  );

  const open = dropdownOpen && rows.length > 0;
  const highlightedIndex = rows.length === 0 ? 0 : Math.min(rawHighlightedIndex, rows.length - 1);

  // ── Telefon tam eşleşen kayıtlı müşteri ("yeni adres" ipucu için) ─
  const exactPhoneKey = phoneKey(phone);
  const exactCustomer = useMemo(() => {
    if (exactPhoneKey.length !== 10) return undefined;
    return savedCustomers.find((c) => phoneKey(c.phone) === exactPhoneKey);
  }, [savedCustomers, exactPhoneKey]);
  const activeAddress = exactCustomer
    ? findMatchingAddress(exactCustomer.addresses, address, addressDetail)
    : undefined;
  // Seçilen kayıtlı adres metni değiştirildi mi (başka bir kayıtlı adresle de
  // eşleşmiyorsa) → yeni adres / kayıtlı adresi güncelle seçimi gösterilir.
  const selectedAddr =
    exactCustomer && selectedAddressId
      ? exactCustomer.addresses.find((a) => a.id === selectedAddressId)
      : undefined;
  const editingSelected = !!selectedAddr && addressQuery.length > 0 && !activeAddress;
  const showNewAddressHint =
    !!exactCustomer && addressQuery.length > 0 && !activeAddress && !selectedAddr;

  // ── Telefon yazılarak tamamlanınca (10 hane, tek eşleşme, adres boş) otomatik
  // doldur. Effect DEĞİL, yazma anında: operatör adresi silip yenisini yazarken
  // varsayılan adres geri dolmasın.
  const autoFillDefault = (value: string) => {
    const key = phoneKey(value);
    if (key.length !== 10 || address.trim() !== "") return;
    const matches = savedCustomers.filter((c) => phoneKey(c.phone) === key);
    if (matches.length !== 1) return;
    const def = pickDefaultAddress(matches[0].addresses, matches[0].defaultAddressId);
    if (!def) return;
    // Listeden seçmişçesine doldur — adres id'si de taşınsın ("güncelle" seçimi için).
    onSelectCustomer(matches[0], def);
  };

  const handleAddressChange = (value: string) => {
    onAddressChange(value);
    setActiveField("address");
    setDropdownOpen(value.trim().length >= 2);
    setHighlightedIndex(0);
  };

  const handlePhoneChange = (value: string) => {
    onPhoneChange(value);
    autoFillDefault(value);
    setActiveField("phone");
    setDropdownOpen(value.replace(/\D/g, "").length >= 3);
    setHighlightedIndex(0);
  };

  const handleRowSelect = (row: SuggestionRow) => {
    onSelectCustomer(row.customer, row.addr);
    setDropdownOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const row = rows[highlightedIndex];
      if (row) handleRowSelect(row);
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
    }
  };

  // Numara aramasında adres metni vurgulanmaz (adresteki "12" yanlış sarılmasın).
  const activeQuery = activeField === "address" && !isDigitSearch ? addressQuery : "";

  const renderDropdown = () => (
    <div className="absolute z-50 top-full left-0 right-0 mt-1.5 rounded-xl border bg-popover shadow-xl overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-muted/40">
        <BookUser className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
          Kayıtlı Müşteriler
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {rows.length} adres
        </span>
      </div>
          <ul className="max-h-80 overflow-y-auto scrollbar-hide">
        {rows.map((row, idx) => {
          const isActive = idx === highlightedIndex;
          const { customer: c, addr: a } = row;
          const name = realName(c);
          return (
            <li key={`${c.id}-${a.id}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(idx)}
                onClick={() => handleRowSelect(row)}
                className={cn(
                  "w-full px-3 py-2.5 text-left transition-colors flex items-start gap-3",
                  isActive ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                <CustomerAvatar customer={c} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate leading-tight">
                    {highlightMatch(a.address, activeQuery)}
                    {a.addressDetail && (
                      <span className="text-muted-foreground font-normal">
                        {" · "}
                        {highlightMatch(a.addressDetail, activeQuery)}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground tabular-nums truncate">
                    {a.geo && <MapPin className="h-3 w-3 shrink-0" />}
                    <span className="truncate">
                      {isDigitSearch
                        ? highlightDigits(formatPhone(c.phone), digitQuery)
                        : formatPhone(c.phone)}
                      {name && <> · {highlightMatch(name, activeQuery)}</>}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>   <div className="border-t bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground flex items-center gap-3">
        <span>
          <kbd className="px-1 py-0.5 rounded bg-background ring-1 ring-foreground/10 font-mono text-[9px]">
            ↑↓
          </kbd>{" "}
          gez
        </span>
        <span>
          <kbd className="px-1 py-0.5 rounded bg-background ring-1 ring-foreground/10 font-mono text-[9px]">
            ↵
          </kbd>{" "}
          seç
        </span>
        <span>
          <kbd className="px-1 py-0.5 rounded bg-background ring-1 ring-foreground/10 font-mono text-[9px]">
            esc
          </kbd>{" "}
          kapat
        </span>
      </div>
    </div>
  );

  return (
    <section>
      <SectionTitle icon={User} title="Müşteri" />
      <div className="space-y-2.5" ref={searchRef}>
        {/* Address (primary) */}
        <div className="relative">
          <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Textarea
            placeholder="Açık adres (mahalle, cadde, sokak, no)"
            value={address}
            onChange={(e) => handleAddressChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setActiveField("address");
              if (addressQuery.length >= 2) setDropdownOpen(true);
            }}
            className="pl-10 min-h-11 resize-none"
            rows={2}
            autoFocus={autoFocus}
          />
          {open && activeField === "address" && renderDropdown()}
          {showNewAddressHint && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Bu adres müşteriye yeni adres olarak eklenecek
            </p>
          )}
          {editingSelected && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {updateSaved ? "Kayıtlı adres güncellenecek" : "Yeni adres olarak eklenecek"}
              {" · "}
              <button
                type="button"
                onClick={() => onUpdateSavedChange(!updateSaved)}
                className="font-medium text-primary hover:underline"
              >
                {updateSaved ? "Geri al" : "Kayıtlı adresi güncelle"}
              </button>
            </p>
          )}
        </div>

        {/* Apartment / floor */}
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Daire / Kat (opsiyonel)"
            value={addressDetail}
            onChange={(e) => onAddressDetailChange(e.target.value)}
            className="pl-10 h-10"
          />
        </div>

        {/* Phone */}
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Telefon numarası"
            value={phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setActiveField("phone");
              if (phoneDigits.length >= 3) setDropdownOpen(true);
            }}
            className="pl-10 h-11 text-base"
            inputMode="tel"
            autoComplete="off"
          />
          {open && activeField === "phone" && renderDropdown()}
        </div>

      </div>
    </section>
  );
}
