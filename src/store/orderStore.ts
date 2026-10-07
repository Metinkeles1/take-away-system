import { create } from "zustand";
import {
  type Order,
  type OrderDraft,
  type CustomerInfo,
  type PaymentInfo,
  type OrderStatus,
  type Product,
  type SavedCustomer,
  type PortionOption,
  type OrderItem,
  type ItemOptionChoice,
  type ItemOptionGroup,
  type DiscountInput,
} from "@/types";
import {
  orderItemKey,
  orderItemUnitPrice,
  isPlainItem,
  newLineId,
} from "@/lib/orders/items";
import { toggleOption } from "@/lib/orders/itemOptions";

import {
  createOrder,
  updateOrderStatus as dbUpdateStatus,
  updateOrderPayment as dbUpdatePayment,
  collectOpenAccount as dbCollectOpenAccount,
  setOrderPaymentStatus as dbSetPaymentStatus,
  getOrders,
  type OrdersPeriod,
} from "@/actions/orders";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { updateOrderDetails } from "@/actions/orderEdit";
import { setOrderCourier as dbSetOrderCourier } from "@/actions/courier";
import { getSavedCustomers } from "@/actions/customers";
import { buildOrderFromDraft, calcSubtotal } from "@/lib/orders/factory";
import { calcDiscountAmount, resolveDiscount } from "@/lib/orders/discount";
import { toast } from "sonner";

// ─── Sipariş yükleme hatası: uyarı + otomatik yeniden deneme ──────────────────
// Sunucu geçici olarak hata verirse (ör. deploy anında veritabanı bağlantısı)
// liste boş kalmasın: mevcut siparişler korunur, kullanıcı tek bir uyarı görür
// ve yükleme artan aralıklarla arka planda yeniden denenir. Başarılı ilk
// yüklemede uyarı kapanır ve sayaç sıfırlanır.
const LOAD_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000];
const LOAD_ERROR_TOAST_ID = "orders-load-error";
let loadRetryTimer: ReturnType<typeof setTimeout> | null = null;
let loadFailures = 0;

function clearLoadRetry() {
  if (loadRetryTimer) clearTimeout(loadRetryTimer);
  loadRetryTimer = null;
}

// ─── Store State ──────────────────────────────────────────────────────────────
interface OrderStore {
  // Aktif sipariş taslağı
  draft: OrderDraft;

  // Düzenleme modu — null ise yeni sipariş, dolu ise mevcut siparişin id'si
  editingOrderId: string | null;

  // Tamamlanmış siparişler (geçmiş)
  orders: Order[];

  // Seçili liste dönemi (today/week/month/all). Sessiz yenilemeler bunu kullanır.
  ordersPeriod: OrdersPeriod;

  // Kayıtlı müşteriler
  savedCustomers: SavedCustomer[];

  // Yükleme durumu
  isLoading: boolean;

  // İç durum: optimistic statü değişikliği sunucu tarafından henüz teyit
  // edilmemiş siparişler. loadOrders'ın bir yarış durumunda taze (ama eski)
  // veriyle optimistic'i ezmesini engeller.
  pendingStatus: Record<string, OrderStatus>;

  // ── Draft aksiyonlar ──────────────────────────────────────────────────────
  addItem: (product: Product) => void;
  addItemWithPortion: (product: Product, portion: PortionOption) => void;
  removeItem: (itemKey: string) => void;
  updateQuantity: (itemKey: string, quantity: number) => void;
  updateItemNote: (itemKey: string, note: string) => void;
  // Seçeneği aç/kapat; tek seçimli grupta kardeşini kaldırır, ücretliyse
  // satır tutarını günceller.
  toggleItemOption: (itemKey: string, option: ItemOptionChoice, group: ItemOptionGroup) => void;
  // Satırdan 1 adedi ayrı satıra alır (biri soğansız olacaksa); yeni satırın
  // anahtarını döner. Adet 1 ise null.
  splitItem: (itemKey: string) => string | null;
  setCustomer: (customer: Partial<CustomerInfo>) => void;
  setUpdateSavedAddress: (value: boolean) => void;
  setPayment: (payment: Partial<PaymentInfo>) => void;
  setNotes: (notes: string) => void;
  // Sepet indirimi (yüzde/tutar); null indirimi kaldırır.
  setDiscount: (discount: DiscountInput | null) => void;

  // ── Hesaplamalar (geriye dönük uyumluluk — bileşenlerde selectSubtotal/selectTotal kullanın) ──
  getSubtotal: () => number;
  getDeliveryFee: () => number;
  getTotal: () => number;

  // ── Sipariş tamamla / sıfırla ─────────────────────────────────────────────
  completeOrder: () => Promise<Order | null>;
  resetDraft: () => void;

  // ── Düzenleme modu ────────────────────────────────────────────────────────
  loadOrderForEdit: (order: Order) => void;
  saveEdit: () => Promise<{ ok: boolean; id?: string; error?: string }>;

  // ── Geçmiş ───────────────────────────────────────────────────────────────
  // silent: arka plan yenilemesi (Pusher echo / focus) — skeleton gösterme,
  // listeyi yerinde güncelle. Sadece ilk yüklemede isLoading açılır.
  // period: verilirse seçili dönem değişir; verilmezse mevcut dönem kullanılır.
  loadOrders: (opts?: { silent?: boolean; period?: OrdersPeriod }) => Promise<void>;
  loadSavedCustomers: () => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  updateOrderPayment: (orderId: string, payment: PaymentInfo) => Promise<void>;
  collectOpenAccount: (
    orderId: string,
    payment: PaymentInfo,
    amount?: number,
    note?: string,
  ) => Promise<void>;
  setOrderOpenAccount: (orderId: string, open: boolean) => Promise<void>;
  setOrderCourier: (orderId: string, courier: string | null) => Promise<void>;
  getOrderById: (orderId: string) => Order | undefined;
}

// ─── Başlangıç Taslak ─────────────────────────────────────────────────────────
const initialDraft: OrderDraft = {
  items: [],
  customer: {},
  payment: {},
  notes: "",
};

// ─── Sepete ekleme ──────────────────────────────────────────────────────────
function addLine(
  set: (fn: (state: OrderStore) => Partial<OrderStore>) => void,
  product: Product,
  portion?: PortionOption,
) {
  const unitPrice = orderItemUnitPrice({ product, portion });
  set((state) => {
    const items = state.draft.items;
    const idx = items.findIndex(
      (i) =>
        i.product.id === product.id &&
        i.portion?.size === portion?.size &&
        isPlainItem(i),
    );
    if (idx >= 0) {
      const line = items[idx];
      const next = [...items];
      next[idx] = {
        ...line,
        quantity: line.quantity + 1,
        totalPrice: (line.quantity + 1) * unitPrice,
      };
      return { draft: { ...state.draft, items: next } };
    }
    return {
      draft: {
        ...state.draft,
        items: [
          ...items,
          { product, portion, quantity: 1, totalPrice: unitPrice, lineId: newLineId() },
        ],
      },
    };
  });
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const useOrderStore = create<OrderStore>()((set, get) => ({
  draft: initialDraft,
  editingOrderId: null,
  orders: [],
  ordersPeriod: "week",
  savedCustomers: [],
  isLoading: false,
  pendingStatus: {},

  // ── Ürün ekle ────────────────────────────────────────────────────────
  // Aynı ürün+porsiyonun seçimsiz/notsuz satırı varsa adedi artar; "soğansız"
  // gibi özelleştirilmiş satırlara dokunulmaz, yoksa yeni satır açılır.
  addItem: (product) => addLine(set, product),
  addItemWithPortion: (product, portion) => addLine(set, product, portion),

  // ── Ürün çıkar ─────────────────────────────────────────────────────────
  // itemKey: orderItemKey(item) — sepet satırının kimliği (lineId)
  removeItem: (itemKey) => {
    set((state) => ({
      draft: {
        ...state.draft,
        items: state.draft.items.filter((i) => {
          const key = orderItemKey(i);
          return key !== itemKey;
        }),
      },
    }));
  },

  // ── Miktar güncelle ────────────────────────────────────────────────────
  updateQuantity: (itemKey, quantity) => {
    if (quantity <= 0) {
      get().removeItem(itemKey);
      return;
    }
    set((state) => ({
      draft: {
        ...state.draft,
        items: state.draft.items.map((i) => {
          const key = orderItemKey(i);
          if (key !== itemKey) return i;
          const unitPrice = orderItemUnitPrice(i);
          return { ...i, quantity, totalPrice: quantity * unitPrice };
        }),
      },
    }));
  },

  // ── Ürün notu güncelle ─────────────────────────────────────────────────
  updateItemNote: (itemKey, note) => {
    set((state) => ({
      draft: {
        ...state.draft,
        items: state.draft.items.map((i) => {
          const key = orderItemKey(i);
          return key === itemKey ? { ...i, note: note || undefined } : i;
        }),
      },
    }));
  },

  // ── Hızlı seçim aç/kapat ("Soğansız" vb.) ─────────────────────────────
  toggleItemOption: (itemKey, option, group) => {
    set((state) => ({
      draft: {
        ...state.draft,
        items: state.draft.items.map((i) => {
          if (orderItemKey(i) !== itemKey) return i;
          const next = { ...i, ...toggleOption(i, option, group) };
          return { ...next, totalPrice: next.quantity * orderItemUnitPrice(next) };
        }),
      },
    }));
  },

  // ── 1 adedi ayrı satıra al ─────────────────────────────────────────────
  splitItem: (itemKey) => {
    const items = get().draft.items;
    const idx = items.findIndex((i) => orderItemKey(i) === itemKey);
    const line = items[idx];
    if (!line || line.quantity < 2) return null;
    const unitPrice = orderItemUnitPrice(line);
    const lineId = newLineId();
    const next: OrderItem[] = [...items];
    next[idx] = { ...line, quantity: line.quantity - 1, totalPrice: (line.quantity - 1) * unitPrice };
    // Ayrılan satır seçimsiz başlar — ek ücretsiz taban fiyatla
    next.splice(idx + 1, 0, {
      product: line.product,
      portion: line.portion,
      quantity: 1,
      totalPrice: orderItemUnitPrice({ product: line.product, portion: line.portion }),
      lineId,
    });
    set((state) => ({ draft: { ...state.draft, items: next } }));
    return lineId;
  },

  // ── Kayıtlı adres güncellensin mi (yeni adres yerine) ─────────────────
  setUpdateSavedAddress: (value) => {
    set((state) => ({ draft: { ...state.draft, updateSavedAddress: value } }));
  },

  // ── Müşteri bilgisi set et ─────────────────────────────────────────────
  setCustomer: (customer) => {
    set((state) => ({
      draft: {
        ...state.draft,
        customer: { ...state.draft.customer, ...customer },
      },
    }));
  },

  // ── Ödeme bilgisi set et ───────────────────────────────────────────────
  setPayment: (payment) => {
    set((state) => ({
      draft: {
        ...state.draft,
        payment: { ...state.draft.payment, ...payment },
      },
    }));
  },

  // ── Notları set et ─────────────────────────────────────────────────────
  setNotes: (notes) => {
    set((state) => ({ draft: { ...state.draft, notes } }));
  },

  // ── İndirim set et ─────────────────────────────────────────────────────
  setDiscount: (discount) => {
    set((state) => ({
      draft: { ...state.draft, discount: discount ?? undefined },
    }));
  },

  // ── Hesaplamalar ───────────────────────────────────────────────────────
  getSubtotal: () => {
    return get().draft.items.reduce((sum, i) => sum + i.totalPrice, 0);
  },

  getDeliveryFee: () => {
    return 0;
  },

  getTotal: () => {
    const subtotal = get().getSubtotal();
    return subtotal - calcDiscountAmount(subtotal, get().draft.discount) + get().getDeliveryFee();
  },

  // ── Siparişi tamamla ───────────────────────────────────────────────────
  completeOrder: async () => {
    const { draft, editingOrderId } = get();

    // Defansif: edit modunda completeOrder asla çağrılmamalı. Yanlış wire
    // edildiyse DB'ye yeni kayıt yazıp duplicate üretirdi — sessizce dur.
    if (editingOrderId) {
      console.warn(
        "[orderStore] completeOrder edit modunda çağrıldı; saveEdit kullanılmalı",
      );
      return null;
    }

    if (
      draft.items.length === 0 ||
      !draft.customer.phone ||
      !draft.customer.address ||
      !draft.payment.method
    ) {
      return null;
    }

    const order = buildOrderFromDraft(draft);

    // DB'ye kaydet
    const result = await createOrder(order, {
      updateSavedAddress: draft.updateSavedAddress,
    });
    if (!result.ok) {
      return null;
    }

    // Optimistic UI güncellemesi (DB başarılı olduktan sonra)
    set((state) => ({ orders: [order, ...state.orders] }));

    // Müşteri adresi sunucuda (createOrder) kaydedildi — yerel listeyi tazele
    // ki bir sonraki siparişte yeni adres önerilerde görünsün.
    void get().loadSavedCustomers().catch(() => {});

    return order;
  },

  // ── Taslağı sıfırla ────────────────────────────────────────────────────
  resetDraft: () => {
    set({ draft: initialDraft, editingOrderId: null });
  },

  // ── Düzenleme için mevcut siparişi draft'a yükle ───────────────────────
  loadOrderForEdit: (order) => {
    set({
      editingOrderId: order.id,
      draft: {
        items: order.items.map((i) => (i.lineId ? i : { ...i, lineId: newLineId() })),
        customer: order.customer,
        payment: order.payment,
        notes: order.notes ?? "",
        discount: order.discount
          ? { type: order.discount.type, value: order.discount.value }
          : undefined,
      },
    });
  },

  // ── Düzenleme modunda kaydet ───────────────────────────────────────────
  saveEdit: async () => {
    const { draft, editingOrderId } = get();
    if (!editingOrderId) {
      return { ok: false, error: "Düzenleme modunda değil" };
    }
    if (
      draft.items.length === 0 ||
      !draft.customer.phone ||
      !draft.customer.address
    ) {
      return { ok: false, error: "Telefon, adres ve en az bir ürün gerekli" };
    }

    // Başarılıysa action detay sayfasına redirect eder; istemcide bu, promise'in
    // redirect hatasıyla reddedilmesi demek (yönlendirmeyi Next kendisi yapar).
    try {
      const result = await updateOrderDetails(editingOrderId, {
        items: draft.items,
        customer: draft.customer as CustomerInfo,
        notes: draft.notes,
        discount: draft.discount ?? null,
        payment: draft.payment,
        updateSavedAddress: draft.updateSavedAddress,
      });
      return { ok: false, error: result.error };
    } catch (e) {
      if (!isRedirectError(e)) throw e;
    }

    // Optimistic: lokal listede de güncelle
    const subtotal = calcSubtotal(draft.items);
    const discount = resolveDiscount(subtotal, draft.discount);
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === editingOrderId
          ? {
              ...o,
              items: draft.items,
              customer: draft.customer as CustomerInfo,
              notes: draft.notes,
              ...(draft.payment.method
                ? { payment: { ...o.payment, ...draft.payment } as PaymentInfo }
                : {}),
              subtotal,
              discount,
              total: subtotal - (discount?.amount ?? 0) + (o.deliveryFee ?? 0),
              updatedAt: new Date(),
            }
          : o,
      ),
    }));

    return { ok: true, id: editingOrderId };
  },

  // ── DB'den siparişleri yükle ───────────────────────────────────────────
  loadOrders: async (opts) => {
    // Dönem değiştiyse kaydet; sessiz yenilemeler mevcut dönemi kullanır.
    const period = opts?.period ?? get().ordersPeriod;
    if (opts?.period && opts.period !== get().ordersPeriod) {
      set({ ordersPeriod: opts.period });
    }
    // Sessiz (arka plan) yenilemede skeleton'a geçme — liste yerinde güncellenir.
    if (!opts?.silent) set({ isLoading: true });
    try {
      const fresh = await getOrders(period);
      set((state) => {
        const pending = state.pendingStatus;
        // Teyit bekleyen yoksa düz değiştir (sık yol).
        if (Object.keys(pending).length === 0) return { orders: fresh };

        // Teyit bekleyen statüleri koru. DB artık aynı statüyü döndürdüyse
        // değişiklik teyitlenmiştir → pending'den düşür. Henüz yetişmediyse
        // optimistic statüyü uygulamaya devam et (yarış durumunda ezilmesin).
        const nextPending: Record<string, OrderStatus> = {};
        const orders = fresh.map((o) => {
          const want = pending[o.id];
          if (want === undefined) return o;
          if (o.status === want) return o; // teyitli — pending'e taşımıyoruz
          // Sunucu, bizim optimistic değerimizden FARKLI bir TERMINAL statüye
          // geçtiyse (delivered/cancelled — örn. kuryenin "teslim et"i) başka
          // bir aktör siparişi kapatmış demektir. Bunu asla geri almayız; aksi
          // halde optimistic değer sonsuza dek takılıp DB'yi ezerdi (admin
          // ekranında teslim edilen sipariş "Yolda" kalırdı). Sunucuya güven.
          if (o.status === "delivered" || o.status === "cancelled") return o;
          nextPending[o.id] = want; // henüz yetişmedi — koru
          return { ...o, status: want };
        });
        return { orders, pendingStatus: nextPending };
      });
      if (loadFailures > 0) toast.dismiss(LOAD_ERROR_TOAST_ID);
      loadFailures = 0;
      clearLoadRetry();
    } catch (err) {
      // Hata yukarı fırlatılmaz: çağıranlar (focus, polling, işlem sonrası
      // yenileme) yakalamıyor; mevcut liste ekranda kalır.
      console.error("[orders] yükleme başarısız:", err);
      const delay =
        LOAD_RETRY_DELAYS_MS[Math.min(loadFailures, LOAD_RETRY_DELAYS_MS.length - 1)];
      loadFailures += 1;
      toast.error("Siparişler yüklenemedi", {
        id: LOAD_ERROR_TOAST_ID,
        description: "Bağlantı sorunu olabilir, otomatik olarak tekrar deneniyor…",
        duration: Infinity,
      });
      clearLoadRetry();
      loadRetryTimer = setTimeout(() => {
        loadRetryTimer = null;
        void get().loadOrders({ silent: true });
      }, delay);
    } finally {
      if (!opts?.silent) set({ isLoading: false });
    }
  },

  // ── DB'den kayıtlı müşterileri yükle ──────────────────────────────────
  loadSavedCustomers: async () => {
    const customers = await getSavedCustomers();
    set({ savedCustomers: customers });
  },

  // ── Sipariş durumu güncelle ──────────────────────────────────────────
  updateOrderStatus: async (orderId, status) => {
    // Optimistic update + "teyit bekliyor" işareti (refetch ezmesin).
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, status, updatedAt: new Date() } : o,
      ),
      pendingStatus: { ...state.pendingStatus, [orderId]: status },
    }));
    const res = await dbUpdateStatus(orderId, status);
    if (!res?.ok) {
      // Yazma başarısız: işareti kaldır ve gerçek durumu DB'den çek.
      set((state) => {
        const next = { ...state.pendingStatus };
        delete next[orderId];
        return { pendingStatus: next };
      });
      await get().loadOrders();
    }
  },

  // ── Sipariş ödeme güncelle ──────────────────────────────────────────
  updateOrderPayment: async (orderId, payment) => {
    // Optimistic update
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, payment, updatedAt: new Date() } : o,
      ),
    }));
    const res = await dbUpdatePayment(orderId, payment);
    if (!res?.ok) await get().loadOrders();
  },

  // ── Açık hesabı tahsil et (kısmi olabilir) ─────────────────────────────
  collectOpenAccount: async (orderId, payment, amount, note) => {
    // Optimistic: tahsilatı payments'a ekle, paidAmount'u artır; toplam tutara
    // ulaşıldıysa "paid" yap, aksi halde "open" kalsın (kalan = alacak).
    set((state) => ({
      orders: state.orders.map((o) => {
        if (o.id !== orderId) return o;
        const already = o.paidAmount ?? 0;
        const remaining = Math.max(0, o.total - already);
        const pay = amount == null ? remaining : Math.min(Math.max(0, amount), remaining);
        const newPaid = already + pay;
        const fullyPaid = newPaid >= o.total - 0.001;
        return {
          ...o,
          payments: [
            ...(o.payments ?? []),
            { amount: pay, method: payment.method, mealCardBrand: payment.mealCardBrand, at: new Date(), note: note?.trim() || undefined },
          ],
          paidAmount: newPaid,
          ...(fullyPaid
            ? { payment, paymentStatus: "paid" as const, paidAt: new Date() }
            : {}),
          updatedAt: new Date(),
        };
      }),
    }));
    const res = await dbCollectOpenAccount(orderId, payment, amount, note);
    if (!res?.ok) await get().loadOrders();
  },

  // ── Açık hesaba al / çıkar ─────────────────────────────────────────────
  setOrderOpenAccount: async (orderId, open) => {
    const next = open ? "open" : "paid";
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              paymentStatus: next,
              paidAt: open ? undefined : new Date(),
              updatedAt: new Date(),
            }
          : o,
      ),
    }));
    const res = await dbSetPaymentStatus(orderId, next);
    if (!res?.ok) await get().loadOrders();
  },

  // ── Kurye ata / değiştir / kaldır (admin) ──────────────────────────────
  setOrderCourier: async (orderId, courier) => {
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId
          ? { ...o, courier: courier ?? undefined, updatedAt: new Date() }
          : o,
      ),
    }));
    const res = await dbSetOrderCourier(orderId, courier);
    if (!res?.ok) await get().loadOrders();
  },

  // ── ID ile sipariş getir ───────────────────────────────────────────────
  getOrderById: (orderId) => {
    return get().orders.find((o) => o.id === orderId);
  },
}));

// ─── Türetilmiş Selector'lar (bileşenlerde doğrudan kullanın) ─────────────────
// Tek doğruluk kaynağı — UI'da reduce/validation tekrarlamayın.
type DraftState = { draft: OrderDraft; editingOrderId: string | null };

export const selectSubtotal = (s: DraftState) =>
  s.draft.items.reduce((sum, i) => sum + i.totalPrice, 0);

export const selectDiscountAmount = (s: DraftState) =>
  calcDiscountAmount(selectSubtotal(s), s.draft.discount);

export const selectTotal = (s: DraftState) => selectSubtotal(s) - selectDiscountAmount(s);

export const selectTotalItems = (s: DraftState) =>
  s.draft.items.reduce((sum, i) => sum + i.quantity, 0);

export const selectCanComplete = (s: DraftState) => {
  const { draft, editingOrderId } = s;
  const baseValid =
    draft.items.length > 0 &&
    Boolean(draft.customer.phone) &&
    Boolean(draft.customer.address);
  if (!baseValid) return false;
  // Düzenleme modunda ödeme yöntemi zorunlu değil — mevcut siparişin payment'ı korunur.
  if (editingOrderId) return true;
  return Boolean(draft.payment.method);
};
