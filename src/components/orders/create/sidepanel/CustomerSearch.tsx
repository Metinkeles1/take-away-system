import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type SavedCustomer } from "@/types";
import { cn, formatPhone, formatRelativeTime } from "@/lib/utils";
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

interface CustomerSearchProps {
  address: string;
  addressDetail: string;
  phone: string;
  savedCustomers: SavedCustomer[];
  autoFocus?: boolean;
  onAddressChange: (value: string) => void;
  onAddressDetailChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onSelectCustomer: (c: SavedCustomer) => void;
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

  const query = address.trim();

  const suggestions = useMemo<SavedCustomer[]>(() => {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    return savedCustomers
      .filter((c) => {
        return (
          c.address.toLowerCase().includes(q) ||
          (c.addressDetail?.toLowerCase().includes(q) ?? false) ||
          c.phone.includes(q) ||
          c.name?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
        return +new Date(b.updatedAt) - +new Date(a.updatedAt);
      })
      .slice(0, 8);
  }, [savedCustomers, query]);

  const highlightedIndex =
    suggestions.length === 0 ? 0 : Math.min(rawHighlightedIndex, suggestions.length - 1);

  const handleAddressChange = (value: string) => {
    onAddressChange(value);
    setDropdownOpen(value.trim().length >= 2);
    setHighlightedIndex(0);
  };

  const handleSelect = (c: SavedCustomer) => {
    onSelectCustomer(c);
    setDropdownOpen(false);
  };

  const handleAddressKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!dropdownOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const c = suggestions[highlightedIndex];
      if (c) handleSelect(c);
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
    }
  };

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
            onKeyDown={handleAddressKeyDown}
            onFocus={() => {
              if (query.length >= 2 && suggestions.length > 0) {
                setDropdownOpen(true);
              }
            }}
            className="pl-10 min-h-11 resize-none"
            rows={2}
            autoFocus={autoFocus}
          />
          {dropdownOpen && suggestions.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1.5 rounded-xl border bg-popover shadow-xl overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-muted/40">
                <BookUser className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
                  Kayıtlı Müşteriler
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                  {suggestions.length} sonuç
                </span>
              </div>
              <ul className="max-h-72 overflow-y-auto scrollbar-hide">
                {suggestions.map((c, idx) => {
                  const isActive = idx === highlightedIndex;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        onClick={() => handleSelect(c)}
                        className={cn(
                          "w-full px-3 py-2.5 text-left transition-colors flex items-start gap-3",
                          isActive ? "bg-accent" : "hover:bg-accent/50",
                        )}
                      >
                        <CustomerAvatar customer={c} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate leading-tight">
                            {highlightMatch(c.address, query)}
                            {c.addressDetail && (
                              <span className="text-muted-foreground font-normal">
                                {" · "}
                                {highlightMatch(c.addressDetail, query)}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                            {highlightMatch(formatPhone(c.phone), query)}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                            {c.orderCount}× sipariş
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatRelativeTime(c.updatedAt)}
                          </span>
                        </div>
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
            onChange={(e) => onPhoneChange(e.target.value)}
            className="pl-10 h-11 text-base"
            inputMode="tel"
            autoComplete="off"
          />
        </div>
      </div>
    </section>
  );
}
