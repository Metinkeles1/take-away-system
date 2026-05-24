"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface ProductImageProps {
  src: string;
  alt: string;
  fallbackSrc: string;
  className?: string;
  /** Yüklenirken gösterilecek arka plan tonu için wrapper class'ı */
  placeholderClassName?: string;
  /** next/image sizes — caller layout'una göre verir; varsayılan ürün grid'i için */
  sizes?: string;
  /** Above-fold için true ver — preload + LCP optimize edilir */
  priority?: boolean;
}

const isDataUri = (s: string) => s.startsWith("data:");
// Vercel Blob URL'leri zaten sharp ile optimize edilmiş WebP — Next/Image'ın
// tekrar küçültüp encode etmesine izin verirsek kalite ikinci kez bozulur.
const isVercelBlob = (s: string) => s.includes(".blob.vercel-storage.com");

/**
 * next/image üzerinden optimize edilmiş ürün/kategori resmi.
 * - Yerel JPG/PNG dosyaları otomatik AVIF/WebP'ye dönüşür ve sizes'a göre
 *   ölçeklendirilir → 23 MB orijinal yerine ~30-100 KB servis edilir.
 * - data:image/svg+xml fallback'ler unoptimized geçer (zaten inline).
 * - Yüklenene kadar wrapper'ın bg-muted'i görünür (animate-pulse yok —
 *   30+ kart aynı anda animasyon yapınca scroll'da composite kasıyordu).
 */
export function ProductImage({
  src,
  alt,
  fallbackSrc,
  className,
  placeholderClassName,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px",
  priority = false,
}: ProductImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [errored, setErrored] = useState(false);

  return (
    <div className={cn("relative overflow-hidden bg-muted", placeholderClassName)}>
      <Image
        src={currentSrc}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        unoptimized={isDataUri(currentSrc) || isVercelBlob(currentSrc)}
        onError={() => {
          if (!errored) {
            setErrored(true);
            setCurrentSrc(fallbackSrc);
          }
        }}
        className={cn("object-cover", className)}
      />
    </div>
  );
}
