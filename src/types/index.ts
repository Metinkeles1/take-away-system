// ─── Ürün Kategorileri ───────────────────────────────────────────────
export type ProductCategory =
  | "kebap"
  | "pide"
  | "lahmacun"
  | "durum"
  | "kilo"
  | "corba"
  | "tatli"
  | "icecek";

// ─── Ürün ────────────────────────────────────────────────────────────────────
export interface Product {
  id: string;
  name: string;
  price: number;
  category: ProductCategory;
  description?: string;
  available: boolean;
}

// ─── Sipariş Kalemi ───────────────────────────────────────────────────────────
export interface OrderItem {
  product: Product;
  quantity: number;
  note?: string;
  totalPrice: number;
}

// ─── Müşteri Bilgisi ─────────────────────────────────────────────────────────
export interface CustomerInfo {
  name: string;
  phone: string;
  address: string;
  addressDetail?: string; // Daire, kat vb.
  district?: string;
}

// ─── Ödeme Yöntemi ────────────────────────────────────────────────────────────
export type MealCardBrand =
  | "multinet"
  | "setcard"
  | "pluxee"
  | "edenred"
  | "tokenflex"
  | "metropol";

export type PaymentMethod = "cash" | "card" | "online" | "meal_card" | "iban";

export interface PaymentInfo {
  method: PaymentMethod;
  cashGiven?: number; // Nakit verildi
  change?: number; // Para üstü
  mealCardBrand?: MealCardBrand; // Yemek kartı markası
  ibanName?: string; // IBAN sahibi ad soyad
  ibanNumber?: string; // IBAN numarası
}

// ─── Sipariş Durumu ───────────────────────────────────────────────────────────
export type OrderStatus =
  | "pending" // Beklemede
  | "preparing" // Hazırlanıyor
  | "on-the-way" // Yolda
  | "delivered" // Teslim edildi
  | "cancelled"; // İptal edildi

// ─── Sipariş ─────────────────────────────────────────────────────────────────
export interface Order {
  id: string;
  orderNumber: number;
  items: OrderItem[];
  customer: CustomerInfo;
  payment: PaymentInfo;
  status: OrderStatus;
  notes?: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sipariş Oluşturma (wizard adımları) ─────────────────────────────────────
export type OrderStep = "products" | "customer" | "payment" | "summary";

export interface OrderDraft {
  items: OrderItem[];
  customer: Partial<CustomerInfo>;
  payment: Partial<PaymentInfo>;
  notes?: string;
  currentStep: OrderStep;
}

// ─── Form Validasyon Şemaları için tipler ─────────────────────────────────────
export interface CustomerFormData {
  phone: string;
  address: string;
  addressDetail?: string;
  district?: string;
}

export interface PaymentFormData {
  method: PaymentMethod;
  cashGiven?: string;
  mealCardBrand?: MealCardBrand;
  ibanName?: string;
  ibanNumber?: string;
}

// ─── Kayıtlı Müşteri ─────────────────────────────────────────────────────────
export interface SavedCustomer {
  id: string;
  name: string;
  phone: string;
  address: string;
  addressDetail?: string;
  orderCount: number;
  updatedAt: Date;
}
