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

// ─── Porsiyon ────────────────────────────────────────────────────────────────
export type PortionSize = "half" | "full" | "one_and_half";

export interface PortionOption {
  size: PortionSize;
  label: string;
  multiplier: number; // fiyat çarpanı: 0.5 | 1 | 1.5
}

export const PORTION_OPTIONS: PortionOption[] = [
  { size: "half", label: "0.5 Porsiyon", multiplier: 0.5 },
  { size: "full", label: "1 Porsiyon", multiplier: 1 },
  { size: "one_and_half", label: "1.5 Porsiyon", multiplier: 1.5 },
];

// Porsiyon destekleyen kategoriler — geçmiş kayıtlar için fallback.
// Yeni ürünlerde Product.portionable alanı kullanılır; bu liste sadece
// migration/seed sırasında varsayılan değer hesaplamak için var.
export const PORTIONABLE_CATEGORIES: ProductCategory[] = ["kebap", "pide", "durum"];

// ─── Ürün ────────────────────────────────────────────────────────────────────
export interface Product {
  id: string;
  name: string;
  price: number;
  category: ProductCategory;
  description?: string;
  available: boolean;
  image?: string; // Blob URL veya /images/products/{slug}.jpg yolu; yoksa kategori-temalı fallback SVG üretilir
  portionable?: boolean; // Porsiyon (½/1/1½) seçeneği sunulsun mu
}

// ─── Sipariş Kalemi ───────────────────────────────────────────────────────────
export interface OrderItem {
  product: Product;
  quantity: number;
  portion?: PortionOption; // porsiyon bilgisi (varsa)
  note?: string;
  totalPrice: number;
}

// ─── Coğrafi Konum ───────────────────────────────────────────────────────────
// Kurye teslim ederken yakalanan kesin GPS koordinatı. Metin adresi geocode
// etmek yerine harita doğrudan bu noktaya pinlenir.
export interface GeoPoint {
  lat: number;
  lng: number;
}

// ─── Müşteri Bilgisi ─────────────────────────────────────────────────────────
export interface CustomerInfo {
  name: string;
  phone: string;
  address: string;
  addressDetail?: string; // Daire, kat vb.
  district?: string;
  geo?: GeoPoint; // teslimatta yakalanmış kesin konum
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

// ─── Sipariş Kaynağı ─────────────────────────────────────────────────────────
// Manuel = panelden açılan; diğerleri 3. parti pazaryeri entegrasyonları
export type OrderSource = "manual" | "trendyol" | "getir" | "yemeksepeti";

// ─── Tahsilat Durumu ─────────────────────────────────────────────────────────
// "paid" = ödeme alındı (varsayılan). "open" = açık hesap, ödeme sonra alınacak.
export type PaymentStatus = "paid" | "open";

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
  // Pazaryeri entegrasyonu — manuel siparişler için boş
  source?: OrderSource;
  externalRef?: string; // örn. Trendyol sipariş kodu
  // Tahsilat durumu — "open" ise açık hesap (henüz ödenmedi). Varsayılan "paid".
  paymentStatus?: PaymentStatus;
  paidAt?: Date; // açık hesabın tahsil edildiği an
}

// ─── Sipariş Oluşturma Taslağı ───────────────────────────────────────────────
export interface OrderDraft {
  items: OrderItem[];
  customer: Partial<CustomerInfo>;
  payment: Partial<PaymentInfo>;
  notes?: string;
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

// ─── Kurumsal Müşteri (Cari) ─────────────────────────────────────────────────
export type BillingType = "per_person" | "per_item";

export interface Corporate {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  billingType: BillingType;
  pricePerPerson?: number; // sadece per_person tipinde anlamlı
  voucherCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CorporateInput = Omit<Corporate, "voucherCount" | "createdAt" | "updatedAt">;

// ─── Fiş Kalemi (per_item için) ─────────────────────────────────────────────
export interface VoucherItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  portionLabel?: string;
  note?: string;
}

// ─── Fiş (Voucher) ───────────────────────────────────────────────────────────
export interface Voucher {
  id: string;
  voucherNumber: number;
  corporateId: string;
  corporateName: string;
  billingType: BillingType;
  date: Date;
  // per_person alanları
  personCount?: number;
  pricePerPerson?: number;
  // per_item alanları
  items?: VoucherItem[];
  // ortak
  total: number;
  note?: string;
  paid: boolean;
  paidAt?: Date;
  paidAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type VoucherInput =
  | {
      type: "per_person";
      corporateId: string;
      date: Date;
      personCount: number;
      pricePerPerson?: number;
      note?: string;
    }
  | {
      type: "per_item";
      corporateId: string;
      date: Date;
      items: VoucherItem[];
      note?: string;
    };

// ─── Tahsilat Hareketi (Payment) ─────────────────────────────────────────────
// Bir fiş üzerinde yapılan her tahsilat/iptal hareketi. delta pozitifse ödeme
// alındı, negatifse iptal/düzeltme. Toplamı fiş.paidAmount'a eşittir.
export type PaymentSource =
  | "manual_toggle" // tek tık ile tam tahsil/geri al
  | "manual_edit" // tahsilatı düzenle dialog'undan
  | "collect" // FIFO tutar tahsilatı
  | "period_paid"; // tüm ayı tahsil et

export interface Payment {
  id: string;
  voucherId: string;
  corporateId: string;
  delta: number;
  source: PaymentSource;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Dönemsel İstatistik ─────────────────────────────────────────────────────
export interface PeriodStats {
  count: number;
  total: number;
  paid: number;
  unpaid: number;
}

// Geriye dönük uyumluluk
export type MonthlyStats = PeriodStats;
