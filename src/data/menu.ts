import { type Product, type ProductCategory } from "@/types";

export const MENU_CATEGORIES: { value: ProductCategory; label: string; emoji: string }[] =
  [
    { value: "kebap", label: "Kebap", emoji: "🥩" },
    { value: "pide", label: "Pide", emoji: "🍕" },
    { value: "lahmacun", label: "Lahmacun", emoji: "🌯" },
    { value: "durum", label: "Dürüm", emoji: "🥙" },
    { value: "kilo", label: "Kilo İşi", emoji: "⚖️" },
    { value: "corba", label: "Çorba", emoji: "🍲" },
    { value: "tatli", label: "Tatlı", emoji: "🍰" },
    { value: "icecek", label: "İçecek", emoji: "🥤" },
  ];

export const MENU_ITEMS: Product[] = [
  // ── Kebap Çeşitleri ───────────────────────────────────────────
  { id: "k1", name: "Adana Kebap", price: 400, category: "kebap", available: true },
  { id: "k2", name: "Urfa Kebap", price: 400, category: "kebap", available: true },
  { id: "k3", name: "Sebzeli Kebap", price: 400, category: "kebap", available: true },
  { id: "k4", name: "Patlıcanlı Kebap", price: 550, category: "kebap", available: true },
  { id: "k5", name: "Domatesli Kebap", price: 500, category: "kebap", available: true },
  { id: "k6", name: "Karışık Kebap", price: 1250, category: "kebap", available: true },
  { id: "k7", name: "Beyti", price: 500, category: "kebap", available: true },
  { id: "k8", name: "Fırın Beyti", price: 500, category: "kebap", available: true },
  { id: "k9", name: "Köfte", price: 500, category: "kebap", available: true },
  { id: "k10", name: "Konak Köfte", price: 500, category: "kebap", available: true },
  { id: "k11", name: "Tavuk Şiş", price: 350, category: "kebap", available: true },
  { id: "k12", name: "Et Şiş", price: 550, category: "kebap", available: true },
  { id: "k13", name: "Kanat", price: 350, category: "kebap", available: true },
  { id: "k14", name: "Kanat Yaprak", price: 400, category: "kebap", available: true },
  { id: "k15", name: "Tavuk Göğüs", price: 350, category: "kebap", available: true },
  { id: "k16", name: "Tavuk Pirzola", price: 350, category: "kebap", available: true },
  { id: "k17", name: "Ciğer", price: 550, category: "kebap", available: true },
  { id: "k18", name: "Ali Nazik Kebabı", price: 550, category: "kebap", available: true },
  {
    id: "k19",
    name: "Konak Kebap Spesiyali",
    price: 750,
    category: "kebap",
    available: true,
  },
  { id: "k20", name: "Adana İskender", price: 400, category: "kebap", available: true },
  { id: "k21", name: "Yoğurtlu Kebap", price: 500, category: "kebap", available: true },
  {
    id: "k22",
    name: "Altı Ezmeli Kebap",
    price: 500,
    category: "kebap",
    available: true,
  },

  // ── Pide Çeşitleri ────────────────────────────────────────────
  {
    id: "p1",
    name: "Kuşbaşı Kaşarlı Pide",
    price: 350,
    category: "pide",
    available: true,
  },
  {
    id: "p2",
    name: "Kıymalı Kaşarlı Pide",
    price: 300,
    category: "pide",
    available: true,
  },
  {
    id: "p3",
    name: "Kavurmalı Kaşarlı Pide",
    price: 450,
    category: "pide",
    available: true,
  },
  {
    id: "p4",
    name: "Sucuklu Kaşarlı Pide",
    price: 350,
    category: "pide",
    available: true,
  },
  { id: "p5", name: "Kaşarlı Pide", price: 300, category: "pide", available: true },
  { id: "p6", name: "Karışık Pide", price: 350, category: "pide", available: true },

  // ── Lahmacun Çeşitleri ────────────────────────────────────────
  { id: "l1", name: "Lahmacun", price: 100, category: "lahmacun", available: true },
  { id: "l3", name: "Fındık Lahmacun", price: 50, category: "lahmacun", available: true },
  {
    id: "l2",
    name: "Kaşarlı Lahmacun",
    price: 120,
    category: "lahmacun",
    available: true,
  },

  // ── Dürüm Çeşitleri ───────────────────────────────────────────
  { id: "d1", name: "Adana Dürüm", price: 275, category: "durum", available: true },
  { id: "d2", name: "Urfa Dürüm", price: 275, category: "durum", available: true },
  { id: "d3", name: "Tavuk Şiş Dürüm", price: 200, category: "durum", available: true },
  { id: "d4", name: "Et Şiş Dürüm", price: 350, category: "durum", available: true },
  { id: "d5", name: "Ciğer Dürüm", price: 350, category: "durum", available: true },
  { id: "d6", name: "Fırın Dürüm", price: 300, category: "durum", available: true },

  // ── Kilo İşi ──────────────────────────────────────────────────
  { id: "ki1", name: "Kilo Kanat", price: 900, category: "kilo", available: true },
  { id: "ki2", name: "Kilo Köfte", price: 1200, category: "kilo", available: true },
  { id: "ki3", name: "Kilo Pirzola", price: 800, category: "kilo", available: true },

  // ── Çorba Çeşitleri ───────────────────────────────────────────
  { id: "c1", name: "Süzme Mercimek", price: 100, category: "corba", available: true },
  { id: "c2", name: "Yayla Çorbası", price: 120, category: "corba", available: true },
  { id: "c3", name: "Kelle Paça", price: 300, category: "corba", available: true },

  // ── Tatlı Çeşitleri ───────────────────────────────────────────
  { id: "t1", name: "Sütlaç", price: 120, category: "tatli", available: true },
  { id: "t2", name: "Künefe", price: 200, category: "tatli", available: true },
  { id: "t3", name: "Katmer", price: 250, category: "tatli", available: true },

  // ── İçecekler ─────────────────────────────────────────────────
  { id: "i1", name: "Ayran", price: 40, category: "icecek", available: true },
  { id: "i2", name: "Kola/Yedigün", price: 60, category: "icecek", available: true },
  { id: "i3", name: "Gazoz", price: 60, category: "icecek", available: true },
  { id: "i4", name: "Şalgam", price: 60, category: "icecek", available: true },
  { id: "i5", name: "Ice Tea", price: 60, category: "icecek", available: true },
  { id: "i6", name: "Meyve Suyu", price: 60, category: "icecek", available: true },
  { id: "i7", name: "Su", price: 20, category: "icecek", available: true },
  { id: "i8", name: "Meyveli Soda", price: 50, category: "icecek", available: true },
  { id: "i9", name: "Sade Soda", price: 20, category: "icecek", available: true },
  { id: "i10", name: "Kola 1 Lt", price: 90, category: "icecek", available: true },
  { id: "i11", name: "Ayran 1 Lt", price: 70, category: "icecek", available: true },
];

export const DELIVERY_FEE = 0;
export const FREE_DELIVERY_THRESHOLD = 0;
