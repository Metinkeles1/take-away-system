"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ProductImageProps {
  src: string;
  alt: string;
  fallbackSrc: string;
  className?: string;
  /** Yüklenirken gösterilecek arka plan tonu */
  placeholderClassName?: string;
}

/**
 * Yerel resim yoksa fallback URL'e geçer. Yüklenene kadar yumuşak placeholder.
 */
export function ProductImage({
  src,
  alt,
  fallbackSrc,
  className,
  placeholderClassName,
}: ProductImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div className={cn("relative overflow-hidden bg-muted", placeholderClassName)}>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-linear-to-br from-muted to-muted/60" />
      )}
      <img
        src={currentSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (!errored) {
            setErrored(true);
            setCurrentSrc(fallbackSrc);
          }
        }}
        className={cn(
          "h-full w-full object-cover transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </div>
  );
}
