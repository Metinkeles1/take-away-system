import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type CustomerAddress, type SavedCustomer } from "@/types";
import { cn, formatPhone, phoneKey } from "@/lib/utils";
import { findMatchingAddress, pickDefaultAddress } from "@/lib/customers/addresses";
import { Phone, MapPin, Building2, BookUser, Plus } from "lucide-react";
import { SectionTitle } from "./SectionTitle";
import { CustomerAddressChips } from "./CustomerAddressChips";
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

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  const q = query.toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-900 text-foreground rounded px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

// ─── Öneri gruplama ────────────────────────────────────────────────────────
// Bir müşteri = bir grup; grup içinde varsayılan/son kullanılan adres önde,
// sonra son kullanıma göre azalan sırayla diğer adresler.

interface SuggestionGroup {
  customer: SavedCustomer;
  addresses: CustomerAddress[];
}

type SuggestionRow =
  | { kind: "address"; customer: SavedCustomer; addr: CustomerAddress }
  | { kind: "new"; customer: SavedCustomer };

type DisplayItem =
  | { kind: "header"; customer: SavedCustomer; isFirstGroup: boolean }
  | {
      kind: "address";
      customer: SavedCustomer;
      addr: CustomerAddress;
      rowIndex: number;
      showBadge: boolean;
    }
  | { kind: "new"; customer: SavedCustomer; rowIndex: number };

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
  const addressRef = useRef<HTMLTextAreaElement>(null);

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

  // ── Öneri grupları: hangi alan yazılıyorsa ona göre filtrele ───────────
  const groups = useMemo<SuggestionGroup[]>(() => {
    if (activeField === "phone" && phoneDigits.length >= 3) {
      const matched = savedCustomers.filter((c) =>
        c.phone.replace(/\D/g, "").includes(phoneDigits),
      );
      return sortGroups(
        matched.map((c) => ({ customer: c, addresses: sortAddresses(c, c.addresses) })),
      );
    }
    if (activeField === "address" && addressQuery.length >= 2) {
      const q = addressQuery.toLocaleLowerCase("tr-TR");
      const matched: SuggestionGroup[] = [];
      for (const c of savedCustomers) {
        const nameMatches =
          !!realName(c) && c.name.toLocaleLowerCase("tr-TR").includes(q);
        const matchingAddrs = c.addresses.filter(
          (a) =>
            a.address.toLocaleLowerCase("tr-TR").includes(q) ||
            (a.addressDetail?.toLocaleLowerCase("tr-TR").includes(q) ?? false),
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
  }, [activeField, phoneDigits, addressQuery, savedCustomers]);

  // ── Düz (klavye ile gezilebilir) satır listesi + görüntü listesi ───────
  const { rows, displayItems } = useMemo(() => {
    const rows: SuggestionRow[] = [];
    const displayItems: DisplayItem[] = [];
    groups.forEach((g, gIdx) => {
      displayItems.push({ kind: "header", customer: g.customer, isFirstGroup: gIdx === 0 });
      g.addresses.forEach((a, aIdx) => {
        const rowIndex = rows.length;
        rows.push({ kind: "address", customer: g.customer, addr: a });
        displayItems.push({
          kind: "address",
          customer: g.customer,
          addr: a,
          rowIndex,
          showBadge: aIdx === 0 && g.addresses.length > 1,
        });
      });
      const rowIndex = rows.length;
      rows.push({ kind: "new", customer: g.customer });
      displayItems.push({ kind: "new", customer: g.customer, rowIndex });
    });
    return { rows, displayItems };
  }, [groups]);

  const open = dropdownOpen && rows.length > 0;
  const highlightedIndex = rows.length === 0 ? 0 : Math.min(rawHighlightedIndex, rows.length - 1);

  // ── Telefon tam eşleşen kayıtlı müşteri (chip'ler + "yeni adres" ipucu) ─
  const exactPhoneKey = phoneKey(phone);
  const exactCustomer = useMemo(() => {
    if (exactPhoneKey.length !== 10) return undefined;
    return savedCustomers.find((c) => phoneKey(c.phone) === exactPhoneKey);
  }, [savedCustomers, exactPhoneKey]);
  const activeAddress = exactCustomer
    ? findMatchingAddress(exactCustomer.addresses, address, addressDetail)
    : undefined;
  const showNewAddressHint =
    !!exactCustomer && addressQuery.length > 0 && !activeAddress;

  // ── Telefon yazılarak tamamlanınca (10 hane, tek eşleşme, adres boş) otomatik
  // doldur. Effect DEĞİL, yazma anında: "+ Yeni adres" adresi boşaltınca
  // varsayılan adres geri dolmasın.
  const autoFillDefault = (value: string) => {
    const key = phoneKey(value);
    if (key.length !== 10 || address.trim() !== "") return;
    const matches = savedCustomers.filter((c) => phoneKey(c.phone) === key);
    if (matches.length !== 1) return;
    const def = pickDefaultAddress(matches[0].addresses, matches[0].defaultAddressId);
    if (!def) return;
    onAddressChange(def.address);
    onAddressDetailChange(def.addressDetail ?? "");
  };

  const focusAddressField = () => {
    requestAnimationFrame(() => addressRef.current?.focus());
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
    if (row.kind === "address") {
      onSelectCustomer(row.customer, row.addr);
    } else {
      onPhoneChange(row.customer.phone);
      onAddressChange("");
      onAddressDetailChange("");
      focusAddressField();
    }
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

  const activeQuery = activeField === "address" ? addressQuery : "";

  const renderDropdown = () => (
    <div className="absolute z-50 top-full left-0 right-0 mt-1.5 rounded-xl border bg-popover shadow-xl overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-muted/40">
        <BookUser className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
          Kayıtlı Müşteriler
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {groups.length} müşteri
        </span>
      </div>
      <ul className="max-h-80 overflow-y-auto scrollbar-hide">
        {displayItems.map((item) => {
          if (item.kind === "header") {
            return (
              <li
                key={`h-${item.customer.id}`}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 bg-muted/40",
                  !item.isFirstGroup && "border-t",
                )}
              >
                <CustomerAvatar customer={item.customer} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold tabular-nums truncate">
                    {formatPhone(item.customer.phone)}
                    {realName(item.customer) && (
                      <span className="text-muted-foreground font-normal">
                        {" · "}
                        {highlightMatch(item.customer.name, activeQuery)}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {item.customer.orderCount} sipariş
                </span>
              </li>
            );
          }
          if (item.kind === "address") {
            const isActive = item.rowIndex === highlightedIndex;
            const a = item.addr;
            return (
              <li key={`a-${item.customer.id}-${a.id}`}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightedIndex(item.rowIndex)}
                  onClick={() => handleRowSelect({ kind: "address", customer: item.customer, addr: a })}
                  className={cn(
                    "w-full pl-11 pr-3 py-2 text-left transition-colors flex items-start gap-2",
                    isActive ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate leading-tight flex items-center gap-1">
                      {a.geo && (
                        <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate">
                        {highlightMatch(a.address, activeQuery)}
                        {a.addressDetail && (
                          <span className="text-muted-foreground font-normal">
                            {" · "}
                            {highlightMatch(a.addressDetail, activeQuery)}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {item.showBadge && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold">
                        son kullanılan
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {a.useCount} kez
                    </span>
                  </div>
                </button>
              </li>
            );
          }
          const isActive = item.rowIndex === highlightedIndex;
          return (
            <li key={`n-${item.customer.id}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(item.rowIndex)}
                onClick={() => handleRowSelect({ kind: "new", customer: item.customer })}
                className={cn(
                  "w-full pl-11 pr-3 py-2 text-left transition-colors flex items-center gap-1.5 text-primary",
                  isActive ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="text-sm font-medium">Bu numaraya yeni adres</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground flex items-center gap-3">
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
            ref={addressRef}
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

        {/* Aynı numaraya kayıtlı birden fazla adres varsa hızlı seçim */}
        {exactCustomer && exactCustomer.addresses.length >= 2 && (
          <CustomerAddressChips
            addresses={sortAddresses(exactCustomer, exactCustomer.addresses)}
            activeAddressId={activeAddress?.id}
            onSelect={(a) => {
              onAddressChange(a.address);
              onAddressDetailChange(a.addressDetail ?? "");
            }}
            onNew={() => {
              onAddressChange("");
              onAddressDetailChange("");
              focusAddressField();
            }}
          />
        )}
      </div>
    </section>
  );
}
