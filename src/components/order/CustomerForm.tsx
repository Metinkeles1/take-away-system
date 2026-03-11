"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useOrderStore } from "@/store/orderStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  ArrowRight,
  User,
  Phone,
  MapPin,
  Building2,
  Zap,
  X,
} from "lucide-react";
import { type CustomerFormData } from "@/types";
import { SANCAKTEPE_DISTRICTS, MAHALLE_LISTESI } from "@/data/districts";

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

export default function CustomerForm() {
  const { draft, orders, setCustomer, setStep } = useOrderStore();

  // Mahalle arama
  const [mahalleQuery, setMahalleQuery] = useState("");
  const [selectedMahalle, setSelectedMahalle] = useState<string | null>(null);
  const [mahalleOpen, setMahalleOpen] = useState(false);

  // Sokak arama
  const [streetQuery, setStreetQuery] = useState("");
  const [streetOpen, setStreetOpen] = useState(false);

  const mahalleRef = useRef<HTMLDivElement>(null);
  const streetRef = useRef<HTMLDivElement>(null);

  const nextCustomerLabel = `Müşteri ${orders.length + 1}`;

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

  useEffect(() => {
    if (!draft.customer.name) {
      setValue("name", nextCustomerLabel, { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dışarı tıklanınca dropdown'ları kapat
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (mahalleRef.current && !mahalleRef.current.contains(e.target as Node)) {
        setMahalleOpen(false);
      }
      if (streetRef.current && !streetRef.current.contains(e.target as Node)) {
        setStreetOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedDistrict = watch("district");

  const handleAutoName = () => {
    setValue("name", nextCustomerLabel, { shouldValidate: true });
  };

  // Mahalle seçildiğinde sokak aramayı sıfırla
  const handleMahalleSelect = (mahalle: string) => {
    setSelectedMahalle(mahalle);
    setMahalleQuery(mahalle);
    setMahalleOpen(false);
    setStreetQuery("");
    setValue("district", mahalle, { shouldValidate: true });
  };

  // Sokak seçildiğinde "Mahalle - Sokak" yaz
  const handleStreetSelect = (street: string) => {
    setStreetQuery(street);
    setStreetOpen(false);
    const value = selectedMahalle ? `${selectedMahalle} - ${street}` : street;
    setValue("district", value, { shouldValidate: true });
  };

  // Tamamen sıfırla
  const handleClear = () => {
    setSelectedMahalle(null);
    setMahalleQuery("");
    setStreetQuery("");
    setValue("district", "", { shouldValidate: false });
  };

  // Mahalle arama sonuçları
  const mahalleSuggestions = mahalleQuery.trim()
    ? MAHALLE_LISTESI.filter((m) =>
        m.toLocaleLowerCase("tr").includes(mahalleQuery.toLocaleLowerCase("tr")),
      )
    : MAHALLE_LISTESI;

  // Sokak arama sonuçları
  const availableStreets = selectedMahalle
    ? (SANCAKTEPE_DISTRICTS[selectedMahalle]?.streets ?? [])
    : [];
  const streetSuggestions = streetQuery.trim()
    ? availableStreets.filter((s) =>
        s.toLocaleLowerCase("tr").includes(streetQuery.toLocaleLowerCase("tr")),
      )
    : availableStreets;

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
                  onClick={handleAutoName}
                  title={`"${nextCustomerLabel}" olarak doldur`}
                  className="shrink-0"
                >
                  <Zap className="h-4 w-4" />
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

            {/* Mahalle + Sokak — iki aşamalı arama */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Mahalle / Sokak
                </Label>
              </div>

              {/* Mahalle arama input'u */}
              <div className="relative" ref={mahalleRef}>
                <Input
                  placeholder="Mahalle ara... (örn: Sarı, Fat, Sam)"
                  value={mahalleQuery}
                  onChange={(e) => {
                    setMahalleQuery(e.target.value);
                    setMahalleOpen(true);
                    // Mahalle değiştiyse sokağı sıfırla
                    if (selectedMahalle && e.target.value !== selectedMahalle) {
                      setSelectedMahalle(null);
                      setStreetQuery("");
                      setValue("district", e.target.value, { shouldValidate: false });
                    }
                  }}
                  onFocus={() => setMahalleOpen(true)}
                  className="pr-8"
                />
                {mahalleQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setMahalleQuery("");
                      setSelectedMahalle(null);
                      setStreetQuery("");
                      setValue("district", "", { shouldValidate: false });
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* Mahalle dropdown */}
                {mahalleOpen && mahalleSuggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
                    <ul className="max-h-44 overflow-y-auto scrollbar-hide py-1">
                      {mahalleSuggestions.map((mahalle) => (
                        <li key={mahalle}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleMahalleSelect(mahalle)}
                            className={`w-full px-3 py-2 text-sm text-left transition-colors hover:bg-accent hover:text-accent-foreground ${
                              selectedMahalle === mahalle
                                ? "bg-primary/10 text-primary font-medium"
                                : ""
                            }`}
                          >
                            {mahalle}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Sokak arama input'u — yalnızca mahalle seçilince göster */}
              {selectedMahalle && (
                <div className="relative" ref={streetRef}>
                  <Input
                    placeholder={`${selectedMahalle} sokak ara... (örn: Ata, Bah)`}
                    value={streetQuery}
                    onChange={(e) => {
                      setStreetQuery(e.target.value);
                      setStreetOpen(true);
                      setValue(
                        "district",
                        e.target.value
                          ? `${selectedMahalle} - ${e.target.value}`
                          : selectedMahalle,
                        { shouldValidate: false },
                      );
                    }}
                    onFocus={() => setStreetOpen(true)}
                    className="pr-8"
                  />
                  {streetQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setStreetQuery("");
                        setValue("district", selectedMahalle, { shouldValidate: false });
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {/* Sokak dropdown */}
                  {streetOpen && streetSuggestions.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
                      <ul className="max-h-44 overflow-y-auto scrollbar-hide py-1">
                        {streetSuggestions.map((street) => {
                          const fullValue = `${selectedMahalle} - ${street}`;
                          return (
                            <li key={street}>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleStreetSelect(street)}
                                className={`w-full px-3 py-2 text-sm text-left transition-colors hover:bg-accent hover:text-accent-foreground ${
                                  selectedDistrict === fullValue
                                    ? "bg-primary/10 text-primary font-medium"
                                    : ""
                                }`}
                              >
                                {street}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}
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
