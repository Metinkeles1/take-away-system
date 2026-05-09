"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { useReactToPrint } from "react-to-print";
import { useOrderStore, selectSubtotal, selectTotal } from "@/store/orderStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Phone,
  MapPin,
  Building2,
  BookUser,
  Banknote,
  CreditCard,
  Utensils,
  Landmark,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Printer,
  Check,
  StickyNote,
  ChevronDown,
  User,
  Loader2,
} from "lucide-react";
import { cn, formatCurrency, formatPhone, formatRelativeTime } from "@/lib/utils";
import {
  type SavedCustomer,
  type PaymentMethod,
  type MealCardBrand,
} from "@/types";
import { DEFAULT_IBAN_NAME, DEFAULT_IBAN_NUMBER } from "@/lib/constants";
import { ProductImage } from "@/components/products/ProductImage";
import { productImage, fallbackProductUrl } from "@/lib/images";
import ThermalReceipt from "@/components/receipt/ThermalReceipt";
import { toast } from "sonner";

const PAYMENT_METHODS: {
  value: PaymentMethod;
  label: string;
  icon: React.ElementType;
  activeClass: string;
}[] = [
  {
    value: "cash",
    label: "Nakit",
    icon: Banknote,
    activeClass:
      "bg-emerald-50 ring-emerald-500 text-emerald-700 dark:bg-emerald-950",
  },
  {
    value: "card",
    label: "Kart",
    icon: CreditCard,
    activeClass: "bg-blue-50 ring-blue-500 text-blue-700 dark:bg-blue-950",
  },
  {
    value: "meal_card",
    label: "Yemek Kartı",
    icon: Utensils,
    activeClass:
      "bg-orange-50 ring-orange-500 text-orange-700 dark:bg-orange-950",
  },
  {
    value: "iban",
    label: "IBAN",
    icon: Landmark,
    activeClass:
      "bg-purple-50 ring-purple-500 text-purple-700 dark:bg-purple-950",
  },
];

const MEAL_CARD_BRANDS: { value: MealCardBrand; label: string }[] = [
  { value: "multinet", label: "Multinet" },
  { value: "setcard", label: "Setcard" },
  { value: "pluxee", label: "Pluxee" },
  { value: "edenred", label: "Edenred" },
  { value: "tokenflex", label: "Tokenflex" },
  { value: "metropol", label: "Metropol" },
];

interface OrderSidePanelProps {
  /** Sticky alt bar ile çalışma modu (mobil Sheet için) */
  variant?: "desktop" | "sheet";
}

export default function OrderSidePanel({ variant = "desktop" }: OrderSidePanelProps) {
  const router = useRouter();
  const {
    draft,
    addItem,
    addItemWithPortion,
    removeItem,
    updateQuantity,
    setCustomer,
    setPayment,
    setNotes,
    completeOrder,
    savedCustomers,
    loadSavedCustomers,
  } = useOrderStore();
  const subtotal = useOrderStore(selectSubtotal);
  const total = useOrderStore(selectTotal);

  const totalItems = useMemo(
    () => draft.items.reduce((sum, i) => sum + i.quantity, 0),
    [draft.items],
  );

  // ── Müşteri listesini bir kez yükle (client-side filtre için) ─────────────
  useEffect(() => {
    if (savedCustomers.length === 0) {
      void loadSavedCustomers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Müşteri arama (client-side, anlık) ───────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
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

  const query = (draft.customer.address ?? "").trim();

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

  // Önerilerde index sınırı
  useEffect(() => {
    if (highlightedIndex >= suggestions.length) {
      setHighlightedIndex(0);
    }
  }, [suggestions.length, highlightedIndex]);

  const handlePhoneChange = (value: string) => {
    setCustomer({ phone: value, name: value }); // name = phone (legacy)
  };

  const handleAddressChange = (value: string) => {
    setCustomer({ address: value });
    setDropdownOpen(value.trim().length >= 2);
    setHighlightedIndex(0);
  };

  const handleSelectCustomer = (c: SavedCustomer) => {
    setCustomer({
      name: c.phone,
      phone: c.phone,
      address: c.address,
      addressDetail: c.addressDetail,
    });
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
      if (c) handleSelectCustomer(c);
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
    }
  };

  // ── Ödeme yöntemi ─────────────────────────────────────────────────────────
  const selectedMethod = (draft.payment.method ?? "cash") as PaymentMethod;
  const selectedBrand = (draft.payment.mealCardBrand ?? "multinet") as MealCardBrand;

  const handleMethodChange = (method: PaymentMethod) => {
    setPayment({
      method,
      mealCardBrand: method === "meal_card" ? selectedBrand : undefined,
      ibanName: method === "iban" ? DEFAULT_IBAN_NAME : undefined,
      ibanNumber: method === "iban" ? DEFAULT_IBAN_NUMBER : undefined,
    });
  };

  // ── Tamamla ──────────────────────────────────────────────────────────────
  const receiptRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: "Siparis-Fis",
  });

  const canComplete =
    draft.items.length > 0 &&
    Boolean(draft.customer.phone) &&
    Boolean(draft.customer.address) &&
    Boolean(draft.payment.method);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleComplete = useCallback(
    async (alsoPrint: boolean) => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      if (!draft.payment.method) {
        setPayment({ method: "cash" });
      }
      try {
        const order = await completeOrder();
        if (!order) {
          toast.error("Lütfen müşteri ve ödeme bilgilerini doldurun.");
          setIsSubmitting(false);
          return;
        }
        toast.success(`#${order.orderNumber} numaralı sipariş alındı!`);
        if (alsoPrint) {
          handlePrint();
        }
        router.push(`/orders/${order.id}`);
      } catch {
        toast.error("Sipariş kaydedilirken bir hata oluştu.");
        setIsSubmitting(false);
      }
    },
    [completeOrder, draft.payment.method, handlePrint, isSubmitting, router, setPayment],
  );

  // ── Notlar (collapsible) ─────────────────────────────────────────────────
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-col bg-card",
        variant === "desktop"
          ? "h-full rounded-2xl ring-1 ring-foreground/8 shadow-sm shadow-foreground/3 overflow-hidden"
          : "h-full",
      )}
    >
      {/* Scroll içerik */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="p-4 space-y-5">
          {/* ── MÜŞTERİ ──────────────────────────────────────────── */}
          <section>
            <SectionTitle icon={User} title="Müşteri" />
            <div className="space-y-2.5" ref={searchRef}>
              {/* Adres (öncelikli) */}
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Textarea
                  placeholder="Açık adres (mahalle, cadde, sokak, no)"
                  value={draft.customer.address ?? ""}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  onKeyDown={handleAddressKeyDown}
                  onFocus={() => {
                    if (query.length >= 2 && suggestions.length > 0) {
                      setDropdownOpen(true);
                    }
                  }}
                  className="pl-10 min-h-11 resize-none"
                  rows={2}
                  autoFocus={variant === "desktop"}
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
                              onClick={() => handleSelectCustomer(c)}
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

              {/* Daire / Kat */}
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Daire / Kat (opsiyonel)"
                  value={draft.customer.addressDetail ?? ""}
                  onChange={(e) => setCustomer({ addressDetail: e.target.value })}
                  className="pl-10 h-10"
                />
              </div>

              {/* Telefon — en altta */}
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Telefon numarası"
                  value={draft.customer.phone ?? ""}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className="pl-10 h-11 text-base"
                  inputMode="tel"
                  autoComplete="off"
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* ── SEPET ──────────────────────────────────────────────── */}
          <section>
            <SectionTitle
              icon={ShoppingCart}
              title="Sepet"
              right={
                totalItems > 0 ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {totalItems} ürün
                  </span>
                ) : null
              }
            />
            {draft.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground rounded-lg bg-muted/30">
                <ShoppingCart className="mb-2 h-8 w-8 opacity-30" />
                <p className="text-xs">Henüz ürün eklenmedi</p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {draft.items.map((item) => {
                  const key = item.portion
                    ? `${item.product.id}:${item.portion.size}`
                    : item.product.id;
                  const unitPrice = item.portion
                    ? Math.round(item.product.price * item.portion.multiplier)
                    : item.product.price;
                  return (
                    <li
                      key={key}
                      className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted/40 transition-colors"
                    >
                      <div className="h-9 w-9 rounded-md overflow-hidden shrink-0 ring-1 ring-foreground/8">
                        <ProductImage
                          src={productImage(item.product)}
                          alt={item.product.name}
                          fallbackSrc={fallbackProductUrl(
                            item.product.id,
                            item.product.category,
                            item.product.name,
                          )}
                          placeholderClassName="h-full w-full"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate leading-tight">
                          {item.product.name}
                          {item.portion && (
                            <span className="ml-1 text-[10px] text-primary font-normal">
                              {item.portion.label}
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {item.quantity} × {formatCurrency(unitPrice)}{" "}
                          <span className="font-semibold text-foreground">
                            {formatCurrency(item.totalPrice)}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 w-6 p-0 rounded-full"
                          onClick={() => updateQuantity(key, item.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-5 text-center text-xs font-bold tabular-nums">
                          {item.quantity}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 w-6 p-0 rounded-full"
                          onClick={() => {
                            if (item.portion) {
                              addItemWithPortion(item.product, item.portion);
                            } else {
                              addItem(item.product);
                            }
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          onClick={() => removeItem(key)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <Separator />

          {/* ── ÖDEME ──────────────────────────────────────────────── */}
          <section>
            <SectionTitle icon={CreditCard} title="Ödeme" />
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((m) => {
                const Icon = m.icon;
                const isActive = selectedMethod === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => handleMethodChange(m.value)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 rounded-xl py-3 px-2 ring-1 transition-all",
                      isActive
                        ? `${m.activeClass} ring-2 shadow-sm`
                        : "ring-foreground/8 bg-card hover:bg-muted/40",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-semibold">{m.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Yemek kartı markası */}
            {selectedMethod === "meal_card" && (
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {MEAL_CARD_BRANDS.map((b) => (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => setPayment({ mealCardBrand: b.value })}
                    className={cn(
                      "rounded-lg py-1.5 px-2 text-xs font-medium ring-1 transition-all",
                      selectedBrand === b.value
                        ? "bg-orange-100 ring-orange-400 text-orange-800 dark:bg-orange-950"
                        : "ring-foreground/8 hover:bg-muted/40",
                    )}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── NOTLAR (collapsible) ───────────────────────────────── */}
          <section>
            <button
              type="button"
              onClick={() => setNotesOpen((o) => !o)}
              className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
            >
              <StickyNote className="h-3.5 w-3.5" />
              Sipariş Notu
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  notesOpen && "rotate-180",
                )}
              />
              {!notesOpen && draft.notes && (
                <span className="text-[10px] font-normal text-foreground normal-case truncate max-w-40">
                  · {draft.notes}
                </span>
              )}
            </button>
            {notesOpen && (
              <Textarea
                placeholder="Özel talep, kapı kodu vb..."
                value={draft.notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-2 resize-none text-sm"
              />
            )}
          </section>
        </div>
      </div>

      {/* Sticky alt bar — toplam + tamamla */}
      <div className="shrink-0 border-t bg-card">
        <div className="px-4 py-3 space-y-2.5">
          {/* Toplam */}
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Toplam
            </span>
            <span className="text-2xl font-bold tabular-nums">
              {formatCurrency(total)}
            </span>
          </div>
          {subtotal !== total && (
            <p className="text-[11px] text-muted-foreground tabular-nums text-right">
              Ara toplam: {formatCurrency(subtotal)}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="lg"
              className="flex-1 h-11"
              disabled={!canComplete || isSubmitting}
              onClick={() => handleComplete(false)}
            >
              {isSubmitting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-4 w-4" />
              )}
              {isSubmitting ? "Tamamlanıyor..." : "Tamamla"}
            </Button>
            <Button
              size="lg"
              className="flex-1 h-11"
              disabled={!canComplete || isSubmitting}
              onClick={() => handleComplete(true)}
            >
              {isSubmitting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-1.5 h-4 w-4" />
              )}
              {isSubmitting ? "Yazdırılıyor..." : "Yazdır & Tamamla"}
            </Button>
          </div>
        </div>
      </div>

      {/* Gizli yazdırma fişi */}
      <div className="hidden">
        <div ref={receiptRef}>
          <ThermalReceipt draft={draft} total={total} subtotal={subtotal} />
        </div>
      </div>
    </div>
  );
}

interface SectionTitleProps {
  icon: React.ElementType;
  title: string;
  right?: React.ReactNode;
}

function SectionTitle({ icon: Icon, title, right }: SectionTitleProps) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>
      <div className="ml-auto">{right}</div>
    </div>
  );
}

// ─── Avatar (telefondan deterministik renk + adres baş harfi) ────────────────

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
    customer.address
      .replace(/[^\p{L}]/gu, "")
      .charAt(0)
      .toUpperCase() || "•";
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

// ─── Eşleşen alt-stringi vurgula ─────────────────────────────────────────────

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
