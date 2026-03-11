"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useOrderStore } from "@/store/orderStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, User, Phone, MapPin, Building2, Shuffle } from "lucide-react";
import { type CustomerFormData } from "@/types";

const customerSchema = z.object({
  name: z
    .string()
    .min(2, "Ad en az 2 karakter olmalı")
    .max(60, "Ad en fazla 60 karakter olabilir"),
  phone: z
    .string()
    .min(10, "Geçerli bir telefon numarası girin")
    .regex(/^[0-9\s\-\(\)]+$/, "Sadece rakam girin"),
  address: z
    .string()
    .min(10, "Adres en az 10 karakter olmalı")
    .max(200, "Adres çok uzun"),
  addressDetail: z.string().max(100).optional(),
  district: z.string().max(60).optional(),
});

// ── Hızlı semt listesi ────────────────────────────────────────────────────────
const QUICK_DISTRICTS = [
  "Merkez", "Bağlar", "Kayapınar", "Yenişehir", "Bismil",
  "Ergani", "Çermik", "Çüngüş", "Dicle", "Eğil",
];

// ── Random isim havuzu ────────────────────────────────────────────────────────
const RANDOM_NAMES = [
  "Ahmet Yılmaz", "Mehmet Kaya", "Mustafa Demir", "Ali Çelik", "Hüseyin Şahin",
  "Fatma Arslan", "Ayşe Doğan", "Emine Yıldız", "Zeynep Aydın", "Hatice Kurt",
  "İbrahim Özkan", "Ömer Güneş", "Hasan Polat", "Murat Koç", "Serkan Erdoğan",
  "Elif Aksoy", "Selin Çetin", "Büşra Kılıç", "Merve Şimşek", "Tuğba Aslan",
];

export default function CustomerForm() {
  const { draft, setCustomer, setStep } = useOrderStore();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: draft.customer.name ?? "",
      phone: draft.customer.phone ?? "",
      address: draft.customer.address ?? "",
      addressDetail: draft.customer.addressDetail ?? "",
      district: draft.customer.district ?? "",
    },
  });

  const selectedDistrict = watch("district");

  const handleRandomName = () => {
    const random = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    setValue("name", random, { shouldValidate: true });
  };

  const handleDistrictSelect = (district: string) => {
    setValue("district", district, { shouldValidate: true });
  };

  const onSubmit = (data: CustomerFormData) => {
    setCustomer(data);
    setStep("payment");
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <User className="h-5 w-5 text-primary" />
            Müşteri Bilgileri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Ad Soyad */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Ad Soyad <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="name"
                  placeholder="Örn: Ahmet Yılmaz"
                  {...register("name")}
                  className={errors.name ? "border-destructive" : ""}
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleRandomName}
                  title="Rastgele isim doldur"
                  className="shrink-0"
                >
                  <Shuffle className="h-4 w-4" />
                </Button>
              </div>
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Telefon */}
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                Telefon <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                placeholder="05XX XXX XX XX"
                {...register("phone")}
                className={errors.phone ? "border-destructive" : ""}
                inputMode="tel"
              />
              {errors.phone && (
                <p className="text-xs text-destructive">{errors.phone.message}</p>
              )}
            </div>

            {/* İlçe / Semt */}
            <div className="space-y-1.5">
              <Label htmlFor="district" className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                İlçe / Semt
              </Label>
              {/* Hızlı seçim chip'leri */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {QUICK_DISTRICTS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDistrictSelect(d)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                      selectedDistrict === d
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <Input
                id="district"
                placeholder="Listede yoksa buraya yazın..."
                {...register("district")}
              />
            </div>

            {/* Adres */}
            <div className="space-y-1.5">
              <Label htmlFor="address" className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Açık Adres <span className="text-destructive">*</span>
              </Label>
              <Input
                id="address"
                placeholder="Mahalle, cadde, sokak, bina no..."
                {...register("address")}
                className={errors.address ? "border-destructive" : ""}
              />
              {errors.address && (
                <p className="text-xs text-destructive">{errors.address.message}</p>
              )}
            </div>

            {/* Daire / Kat */}
            <div className="space-y-1.5">
              <Label htmlFor="addressDetail" className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Daire / Kat Bilgisi
              </Label>
              <Input
                id="addressDetail"
                placeholder="Örn: Kat 3, Daire 7, B Blok"
                {...register("addressDetail")}
              />
            </div>

            {/* Butonlar */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStep("products")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Geri
              </Button>
              <Button type="submit" className="flex-1">
                Ödeme Yöntemi
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

