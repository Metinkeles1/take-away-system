"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
  BookUser,
} from "lucide-react";
import { type CustomerFormData, type SavedCustomer } from "@/types";
import { searchCustomers } from "@/actions/customers";
import { formatPhone } from "@/lib/utils";

const customerSchema = z.object({
  phone: z
    .string()
    .min(10, "Geçerli bir telefon numarası girin")
    .regex(/^[0-9\s\-\(\)]+$/, "Sadece rakam girin"),
  address: z.string().min(5, "Adres en az 5 karakter olmalı").max(200, "Adres çok uzun"),
  addressDetail: z.string().max(100).optional(),
});

export default function CustomerForm() {
  const { draft, setCustomer, setStep } = useOrderStore();

  // ── Kayıtlı müşteri arama (adres odaklı) ─────────────────────────────────
  const [suggestions, setSuggestions] = useState<SavedCustomer[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const addressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addressRef.current && !addressRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      phone: draft.customer.phone ?? "",
      address: draft.customer.address ?? "",
      addressDetail: draft.customer.addressDetail ?? "",
    },
  });

  // Adres alanı değişince DB'de ara (debounced - 350ms)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleAddressChange = useCallback((value: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.trim().length >= 3) {
      searchTimerRef.current = setTimeout(async () => {
        const results = await searchCustomers(value);
        setSuggestions(results);
        setDropdownOpen(results.length > 0);
      }, 350);
    } else {
      setSuggestions([]);
      setDropdownOpen(false);
    }
  }, []);

  // Kayıtlı müşteri seçilince tüm alanları doldur
  const handleSelectCustomer = (c: SavedCustomer) => {
    setValue("address", c.address, { shouldValidate: true });
    setValue("phone", c.phone, { shouldValidate: true });
    setValue("addressDetail", c.addressDetail ?? "", { shouldValidate: false });
    setDropdownOpen(false);
    setSuggestions([]);
  };

  const onSubmit = (data: CustomerFormData) => {
    // name olarak telefon numarasını kullan
    setCustomer({ ...data, name: data.phone });
    setStep("payment");
  };

  return (
    <div className="h-full flex flex-col items-center overflow-hidden">
      <div className="w-full max-w-2xl flex-1 min-h-0 overflow-y-auto scrollbar-hide pt-px px-px pb-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <User className="h-5 w-5 text-primary" />
              Müşteri Bilgileri
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Adres — birincil arama alanı */}
              <div className="space-y-1.5">
                <Label htmlFor="address" className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Açık Adres <span className="text-destructive">*</span>
                </Label>
                <div className="relative" ref={addressRef}>
                  <Input
                    id="address"
                    placeholder="Mahalle, cadde, sokak, bina no..."
                    {...register("address")}
                    onChange={(e) => {
                      void register("address").onChange(e);
                      handleAddressChange(e.target.value);
                    }}
                    className={errors.address ? "border-destructive" : ""}
                    autoComplete="off"
                    autoFocus
                  />
                  {/* Kayıtlı müşteri dropdown */}
                  {dropdownOpen && suggestions.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b bg-muted/50">
                        <BookUser className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-medium">
                          Kayıtlı Müşteriler
                        </span>
                      </div>
                      <ul className="max-h-52 overflow-y-auto scrollbar-hide py-1">
                        {suggestions.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleSelectCustomer(c)}
                              className="w-full px-3 py-2.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                              <div className="text-sm font-medium truncate">
                                {c.address}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground">
                                  {c.name}
                                </span>
                                <span className="text-xs text-muted-foreground">·</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatPhone(c.phone)}
                                </span>
                                {c.addressDetail && (
                                  <>
                                    <span className="text-xs text-muted-foreground">
                                      ·
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {c.addressDetail}
                                    </span>
                                  </>
                                )}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
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
                  autoComplete="off"
                />
                {errors.phone && (
                  <p className="text-xs text-destructive">{errors.phone.message}</p>
                )}
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
    </div>
  );
}
