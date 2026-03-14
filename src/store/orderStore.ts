import { create } from "zustand";
import {
  type Order,
  type OrderDraft,
  type CustomerInfo,
  type PaymentInfo,
  type OrderStep,
  type OrderStatus,
  type Product,
  type SavedCustomer,
} from "@/types";
import { DELIVERY_FEE, FREE_DELIVERY_THRESHOLD } from "@/data/menu";
import {
  createOrder,
  updateOrderStatus as dbUpdateStatus,
  getOrders,
} from "@/actions/orders";
import { getSavedCustomers, upsertCustomer } from "@/actions/customers";

// ─── Yardımcı: Sipariş numarası üret ─────────────────────────────────────────
function generateOrderNumber(): number {
  return Math.floor(1000 + Math.random() * 9000);
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Store State ──────────────────────────────────────────────────────────────
interface OrderStore {
  // Aktif sipariş taslağı
  draft: OrderDraft;

  // Tamamlanmış siparişler (geçmiş)
  orders: Order[];

  // Kayıtlı müşteriler
  savedCustomers: SavedCustomer[];

  // Yükleme durumu
  isLoading: boolean;

  // ── Draft aksiyonlar ──────────────────────────────────────────────────────
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateItemNote: (productId: string, note: string) => void;
  setCustomer: (customer: Partial<CustomerInfo>) => void;
  setPayment: (payment: Partial<PaymentInfo>) => void;
  setNotes: (notes: string) => void;
  setStep: (step: OrderStep) => void;

  // ── Hesaplamalar (geriye dönük uyumluluk — bileşenlerde selectSubtotal/selectTotal kullanın) ──
  getSubtotal: () => number;
  getDeliveryFee: () => number;
  getTotal: () => number;

  // ── Sipariş tamamla / sıfırla ─────────────────────────────────────────────
  completeOrder: () => Promise<Order | null>;
  resetDraft: () => void;

  // ── Geçmiş ───────────────────────────────────────────────────────────────
  loadOrders: () => Promise<void>;
  loadSavedCustomers: () => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  getOrderById: (orderId: string) => Order | undefined;
}

// ─── Başlangıç Taslak ─────────────────────────────────────────────────────────
const initialDraft: OrderDraft = {
  items: [],
  customer: {},
  payment: {},
  notes: "",
  currentStep: "products",
};

// ─── Store ────────────────────────────────────────────────────────────────────
export const useOrderStore = create<OrderStore>()((set, get) => ({
  draft: initialDraft,
  orders: [],
  savedCustomers: [],
  isLoading: false,

  // ── Ürün ekle ──────────────────────────────────────────────────────────
  addItem: (product) => {
    set((state) => {
      const existing = state.draft.items.find((i) => i.product.id === product.id);
      if (existing) {
        return {
          draft: {
            ...state.draft,
            items: state.draft.items.map((i) =>
              i.product.id === product.id
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
  },

  // ── Ürün çıkar ─────────────────────────────────────────────────────────
  removeItem: (productId) => {
    set((state) => ({
      draft: {
        ...state.draft,
        items: state.draft.items.filter((i) => i.product.id !== productId),
      },
    }));
  },

  // ── Miktar güncelle ────────────────────────────────────────────────────
  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId);
      return;
    }
    set((state) => ({
      draft: {
        ...state.draft,
        items: state.draft.items.map((i) =>
          i.product.id === productId
            ? { ...i, quantity, totalPrice: quantity * i.product.price }
            : i,
        ),
      },
    }));
  },

  // ── Ürün notu güncelle ─────────────────────────────────────────────────
  updateItemNote: (productId, note) => {
    set((state) => ({
      draft: {
        ...state.draft,
        items: state.draft.items.map((i) =>
          i.product.id === productId ? { ...i, note } : i,
        ),
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

  // ── Adım değiştir ──────────────────────────────────────────────────────
  setStep: (step) => {
    set((state) => ({ draft: { ...state.draft, currentStep: step } }));
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
    const { draft, getSubtotal, getDeliveryFee, getTotal } = get();

    if (
      draft.items.length === 0 ||
      !draft.customer.phone ||
      !draft.customer.address ||
      !draft.payment.method
    ) {
      return null;
    }

    const cashGiven = draft.payment.cashGiven ?? 0;
    const total = getTotal();

    const order: Order = {
      id: generateId(),
      orderNumber: generateOrderNumber(),
      items: draft.items,
      customer: draft.customer as CustomerInfo,
      payment: {
        method: draft.payment.method!,
        cashGiven: draft.payment.method === "cash" ? cashGiven : undefined,
        change:
          draft.payment.method === "cash" ? Math.max(0, cashGiven - total) : undefined,
      },
      status: "pending",
      notes: draft.notes,
      subtotal: getSubtotal(),
      deliveryFee: getDeliveryFee(),
      total,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Önce UI'ı güncelle (optimistic), sonra DB'ye kaydet
    set((state) => ({ orders: [order, ...state.orders] }));
    await createOrder(order);

    // Müşteriyi kayıtlı müşteriler listesine upsert et
    await upsertCustomer({
      id: `cust-${order.customer.phone.replace(/\D/g, "")}`,
      name: order.customer.name,
      phone: order.customer.phone,
      address: order.customer.address,
      addressDetail: order.customer.addressDetail,
    });
    // Kayıtlı müşteri listesini güncelle
    get().loadSavedCustomers();

    return order;
  },

  // ── Taslağı sıfırla ────────────────────────────────────────────────────
  resetDraft: () => {
    set({ draft: initialDraft });
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

  // ── Sipariş durumu güncelle ────────────────────────────────────────────
  updateOrderStatus: async (orderId, status) => {
    // Optimistic update
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, status, updatedAt: new Date() } : o,
      ),
    }));
    await dbUpdateStatus(orderId, status);
  },

  // ── ID ile sipariş getir ───────────────────────────────────────────────
  getOrderById: (orderId) => {
    return get().orders.find((o) => o.id === orderId);
  },
}));

// ─── Türetilmiş Selector'lar (bileşenlerde doğrudan kullanın) ─────────────────
// Zustand'da getter fonksiyonları store içinde tanımlamak yerine
// dışarıda pure selector olarak tutmak daha performanslıdır.
export const selectSubtotal = (state: { draft: OrderDraft }) =>
  state.draft.items.reduce((sum, i) => sum + i.totalPrice, 0);

export const selectDeliveryFee = (_state: { draft: OrderDraft }) => 0;

export const selectTotal = (state: { draft: OrderDraft }) => {
  return state.draft.items.reduce((sum, i) => sum + i.totalPrice, 0);
};
