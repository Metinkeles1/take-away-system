import type {
  CategoryOptions,
  ItemOptionChoice,
  ItemOptionGroup,
  OrderItem,
  Product,
  ProductCategory,
} from "@/types";

// Sepette ürün satırına tek dokunuşla eklenen hazır istekler ("Soğansız" vb.).
// Asıl liste veritabanındadır (Menü Yönetimi > Seçenekler); buradaki yalnızca
// ilk kurulumda aktarılan ve menü yüklenmeden önce kullanılan varsayılandır.
// Seçilen metin siparişe olduğu gibi kaydedilir (eski siparişler etkilenmez).

type Seed = [name: string, mode: ItemOptionGroup["mode"], options: (string | [string, number])[]];

const ACI: Seed = ["Acı", "single", ["Acısız", "Acılı"]];
const PISME: Seed = ["Pişme", "single", ["Az pişmiş", "İyi pişmiş"]];

const SEED: Record<ProductCategory, Seed[]> = {
  durum: [ACI, ["İstekler", "multi", ["Soğansız", "Maydanozsuz", "Domatessiz", "Bol soslu"]]],
  kebap: [ACI, ["İstekler", "multi", ["Soğansız", "Maydanozsuz", "Salatasız", "Pilavsız"]]],
  pide: [
    PISME,
    ["Yumurta", "single", [["Yumurtalı", 30], "Yumurtasız"]],
    ["İstekler", "multi", ["Bol kaşarlı", "Dilimlenmesin"]],
  ],
  lahmacun: [ACI, PISME, ["İstekler", "multi", ["Soğansız", "Maydanozsuz"]]],
  kilo: [ACI, ["İstekler", "multi", ["Soğansız", "Maydanozsuz"]]],
  corba: [["İstekler", "multi", ["Limonsuz", "Pul biberli", "Ekmeksiz"]]],
  tatli: [["Kaymak", "single", ["Kaymaklı", "Kaymaksız"]], ["İstekler", "multi", ["Fıstıklı"]]],
  icecek: [["İstekler", "multi", ["Soğuk", "Buzsuz"]]],
};

function slug(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-");
}

// Kararlı id'ler: aynı varsayılan her yerde aynı id'yi üretir.
export const DEFAULT_CATEGORY_OPTIONS = Object.fromEntries(
  Object.entries(SEED).map(([cat, groups]) => [
    cat,
    groups.map(([name, mode, options]) => ({
      id: `${cat}-${slug(name)}`,
      name,
      mode,
      options: options.map((o) => {
        const [label, price] = typeof o === "string" ? [o, 0] : o;
        return { id: `${cat}-${slug(label)}`, label, price };
      }),
    })),
  ]),
) as CategoryOptions;

export function newOptionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Ürünün sepette göreceği gruplar: kategorinin grupları, üründe gizlenen
// seçenekler çıkarılmış, boşalan gruplar atılmış.
export function optionGroupsFor(
  config: CategoryOptions | null | undefined,
  product: Pick<Product, "category" | "hiddenOptions">,
): ItemOptionGroup[] {
  const groups = config?.[product.category] ?? DEFAULT_CATEGORY_OPTIONS[product.category] ?? [];
  const hidden = new Set(product.hiddenOptions ?? []);
  if (hidden.size === 0) return groups;
  return groups
    .map((g) => ({ ...g, options: g.options.filter((o) => !hidden.has(o.id)) }))
    .filter((g) => g.options.length > 0);
}

// Seçeneği satırda aç/kapat. Tek seçimli grupta aynı gruptaki diğer seçim
// kalkar (Acılı ↔ Acısız). Ücretli seçimler optionExtras'a fiyatıyla kopyalanır.
export function toggleOption(
  item: Pick<OrderItem, "options" | "optionExtras">,
  option: ItemOptionChoice,
  group: ItemOptionGroup,
): Pick<OrderItem, "options" | "optionExtras"> {
  const current = item.options ?? [];
  const isOn = current.includes(option.label);
  const drop = new Set(
    isOn
      ? [option.label]
      : group.mode === "single"
        ? group.options.map((o) => o.label)
        : [],
  );
  const options = current.filter((o) => !drop.has(o));
  let extras = (item.optionExtras ?? []).filter((e) => !drop.has(e.label));
  if (!isOn) {
    options.push(option.label);
    if (option.price > 0) extras = [...extras, { label: option.label, price: option.price }];
  }
  return {
    options: options.length > 0 ? options : undefined,
    optionExtras: extras.length > 0 ? extras : undefined,
  };
}
