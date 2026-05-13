// Trendyol GO Yemek webhook payload tipleri.
// Resmi doküman partner onayı gerektiriyor — bu tipler sektörden bilinen
// yapıya göre yazıldı, mapper esnek (eksik alanlara toleranslı).

export interface TrendyolWebhookProduct {
  id?: string | number;
  name: string;
  quantity: number;
  price?: number;
  totalPrice?: number;
  note?: string;
  modifierProducts?: TrendyolWebhookProduct[];
}

export interface TrendyolWebhookCustomer {
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  phoneNumber?: string;
  address?: string;
  addressDescription?: string;
  district?: string;
  city?: string;
}

export type TrendyolPaymentMethod =
  | "Online"
  | "Cash"
  | "Card"
  | "OnlinePayment"
  | "CashOnDelivery"
  | string;

export interface TrendyolWebhookOrder {
  id: string | number;
  orderNumber?: string | number;
  packageId?: string | number;
  status?: string;
  creationDate?: string | number;
  totalPrice?: number;
  deliveryFee?: number;
  products?: TrendyolWebhookProduct[];
  items?: TrendyolWebhookProduct[]; // bazı versiyonlarda items, bazısında products
  customer?: TrendyolWebhookCustomer;
  paymentMethod?: TrendyolPaymentMethod;
  note?: string;
  customerNote?: string;
}

export interface TrendyolWebhookEnvelope {
  event?: string; // "order.created" | "order.updated" vb.
  order?: TrendyolWebhookOrder;
  // Bazı sürümler envelope olmadan doğrudan order gönderir
  // — handler her iki şekli de destekler.
}
