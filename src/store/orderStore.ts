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
} from "@/types";

import {
  createOrder,
  updateOrderStatus as dbUpdateStatus,
  updateOrderPayment as dbUpdatePayment,
  getOrders,
} from "@/actions/orders";
import { updateOrderDetails } from "@/actions/orderEdit";
import { getSavedCustomers, upsertCustomer } from "@/actions/customers";
import { buildOrderFromDraft, calcSubtotal } from "@/lib/orders/factory";

// ─── Store State ──────────────────────────────────────────────────────────────
interface OrderStore {
  // Aktif sipariş taslağı
  draft: OrderDraft;

  // Düzenleme modu — null ise yeni sipariş, dolu ise mevcut siparişin id'si
  editingOrderId: string | null;

  // Tamamlanmış siparişler (geçmiş)
  orders: Order[];

  // Kayıtlı müşteriler
  savedCustomers: SavedCustomer[];

  // Yükleme durumu
  isLoading: boolean;

  // ── Draft aksiyonlar ──────────────────────────────────────────────────────
  addItem: (product: Product) => void;
  addItemWithPortion: (product: Product, portion: PortionOption) => void;
  removeItem: (itemKey: string) => void;
  updateQuantity: (itemKey: string, quantity: number) => void;
  updateItemNote: (itemKey: string, note: string) => void;
  setCustomer: (customer: Partial<CustomerInfo>) => void;
  setPayment: (payment: Partial<PaymentInfo>) => void;
  setNotes: (notes: string) => void;

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
  loadOrders: () => Promise<void>;
  loadSavedCustomers: () => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  updateOrderPayment: (orderId: string, payment: PaymentInfo) => Promise<void>;
  getOrderById: (orderId: string) => Order | undefined;
}

// ─── Başlangıç Taslak ─────────────────────────────────────────────────────────
const initialDraft: OrderDraft = {
  items: [],
  customer: {},
  payment: {},
  notes: "",
};

// ─── Store ────────────────────────────────────────────────────────────────────
export const useOrderStore = create<OrderStore>()((set, get) => ({
  draft: initialDraft,
  editingOrderId: null,
  orders: [],
  savedCustomers: [],
  isLoading: false,

  // ── Ürün ekle (porsiyonsuz — fiyat tam olarak kullanılır) ────────────────
  addItem: (product) => {
    const itemKey = product.id;
    set((state) => {
      const existing = state.draft.items.find(
        (i) => i.product.id === product.id && !i.portion,
      );
      if (existing) {
        return {
          draft: {
            ...state.draft,
            items: state.draft.items.map((i) =>
              i.product.id === product.id && !i.portion
                ? {
                    ...i,
                    quantity: i.quantity + 1,
                    totalPrice: (i.quantity + 1) * i.product.price,
                  }
                : i,
            ),
          },
        };
      }
      return {
        draft: {
          ...state.draft,
          items: [
            ...state.draft.items,
            {
              product,
              quantity: 1,
              totalPrice: product.price,
            },
          ],
        },
      };
    });
    void itemKey;
  },

  // ── Porsiyon ile ürün ekle ──────────────────────────────────────────────
  addItemWithPortion: (product, portion) => {
    const portionPrice = Math.round(product.price * portion.multiplier);
    const itemKey = `${product.id}:${portion.size}`;
    set((state) => {
      const existing = state.draft.items.find(
        (i) => i.product.id === product.id && i.portion?.size === portion.size,
      );
      if (existing) {
        return {
          draft: {
            ...state.draft,
            items: state.draft.items.map((i) =>
              i.product.id === product.id && i.portion?.size === portion.size
                ? {
                    ...i,
                    quantity: i.quantity + 1,
                    totalPrice: (i.quantity + 1) * portionPrice,
                  }
                : i,
            ),
          },
        };
      }
      return {
        draft: {
          ...state.draft,
          items: [
            ...state.draft.items,
            {
              product,
              portion,
              quantity: 1,
              totalPrice: portionPrice,
            },
          ],
        },
      };
    });
    void itemKey;
  },

  // ── Ürün çıkar ─────────────────────────────────────────────────────────
  // itemKey: "productId" (porsiyonsuz) | "productId:portionSize" (porsiyonlu)
  removeItem: (itemKey) => {
    set((state) => ({
      draft: {
        ...state.draft,
        items: state.draft.items.filter((i) => {
          const key = i.portion ? `${i.product.id}:${i.portion.size}` : i.product.id;
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
          const key = i.portion ? `${i.product.id}:${i.portion.size}` : i.product.id;
          if (key !== itemKey) return i;
          const unitPrice = i.portion
            ? Math.round(i.product.price * i.portion.multiplier)
            : i.product.price;
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
          const key = i.portion ? `${i.product.id}:${i.portion.size}` : i.product.id;
          return key === itemKey ? { ...i, note } : i;
        }),
      },
    }));
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

  // ── Hesaplamalar ───────────────────────────────────────────────────────
  getSubtotal: () => {
    return get().draft.items.reduce((sum, i) => sum + i.totalPrice, 0);
  },

  getDeliveryFee: () => {
    return 0;
  },

  getTotal: () => {
    return get().getSubtotal() + get().getDeliveryFee();
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
    const result = await createOrder(order);
    if (!result.ok) {
      return null;
    }

    // Optimistic UI güncellemesi (DB başarılı olduktan sonra)
    set((state) => ({ orders: [order, ...state.orders] }));

    // Müşteriyi kayıtlı müşteriler listesine upsert et
    try {
      await upsertCustomer({
        id: `cust-${order.customer.phone.replace(/\D/g, "")}`,
        name: order.customer.name,
        phone: order.customer.phone,
        address: order.customer.address,
        addressDetail: order.customer.addressDetail,
      });
      // Kayıtlı müşteri listesini güncelle
      get().loadSavedCustomers();
    } catch {
      // Müşteri kaydı başarısız olsa bile sipariş tamamlandı
    }

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
        items: order.items,
        customer: order.customer,
        payment: order.payment,
        notes: order.notes ?? "",
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

    const result = await updateOrderDetails(editingOrderId, {
      items: draft.items,
      customer: draft.customer as CustomerInfo,
      notes: draft.notes,
    });

    if (!result.ok) return { ok: false, error: result.error };

    // Optimistic: lokal listede de güncelle
    const subtotal = calcSubtotal(draft.items);
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === editingOrderId
          ? {
              ...o,
              items: draft.items,
              customer: draft.customer as CustomerInfo,
              notes: draft.notes,
              subtotal,
              total: subtotal + (o.deliveryFee ?? 0),
              updatedAt: new Date(),
            }
          : o,
      ),
    }));

    return { ok: true, id: editingOrderId };
  },

  // ── DB'den siparişleri yükle ───────────────────────────────────────────
  loadOrders: async () => {
    set({ isLoading: true });
    try {
      const orders = await getOrders();
      set({ orders });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── DB'den kayıtlı müşterileri yükle ──────────────────────────────────
  loadSavedCustomers: async () => {
    const customers = await getSavedCustomers();
    set({ savedCustomers: customers });
  },

  // ── Sipariş durumu güncelle ──────────────────────────────────────────
  updateOrderStatus: async (orderId, status) => {
    // Optimistic update
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, status, updatedAt: new Date() } : o,
      ),
    }));
    await dbUpdateStatus(orderId, status);
  },

  // ── Sipariş ödeme güncelle ──────────────────────────────────────────
  updateOrderPayment: async (orderId, payment) => {
    // Optimistic update
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, payment, updatedAt: new Date() } : o,
      ),
    }));
    await dbUpdatePayment(orderId, payment);
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

export const selectTotal = (s: DraftState) => selectSubtotal(s);

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
