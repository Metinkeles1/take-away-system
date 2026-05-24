"use client";

import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, X, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductImageFieldProps {
  /** Mevcut resim URL'i (Blob URL veya /images/products yolu) */
  imageUrl: string;
  /** Henüz upload edilmemiş, kullanıcı seçtiği yeni dosya */
  imageFile: File | null;
  /** Field değişti — parent state güncellesin */
  onChange: (next: { imageUrl: string; imageFile: File | null }) => void;
}

const MAX_INPUT_BYTES = 15 * 1024 * 1024;

export function ProductImageField({
  imageUrl,
  imageFile,
  onChange,
}: ProductImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // imageFile için local preview URL'i sync olarak üret; effect sadece cleanup için.
  const localPreview = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile],
  );
  useEffect(() => {
    if (!localPreview) return;
    return () => URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  const previewSrc = localPreview ?? (imageUrl || null);

  const handleFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Sadece resim dosyası yüklenebilir");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      alert("Dosya 15 MB'tan büyük olamaz");
      return;
    }
    onChange({ imageUrl, imageFile: file });
  };

  const handleRemove = () => {
    if (inputRef.current) inputRef.current.value = "";
    onChange({ imageUrl: "", imageFile: null });
  };

  const handlePick = () => inputRef.current?.click();

  return (
    <div className="grid gap-2">
      <Label>Resim</Label>
      <div
        className={cn(
          "relative flex items-center justify-center rounded-lg border border-dashed border-foreground/15 bg-card/40 overflow-hidden transition-colors",
          "aspect-5/3",
          !previewSrc && "hover:border-foreground/30 cursor-pointer",
        )}
        onClick={previewSrc ? undefined : handlePick}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
      >
        {previewSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc}
              alt="Ürün resmi önizlemesi"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 flex gap-2 p-2 bg-linear-to-t from-black/60 to-transparent">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                onClick={handlePick}
              >
                <Upload className="h-3.5 w-3.5 mr-1" />
                Değiştir
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                onClick={handleRemove}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Kaldır
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground py-6">
            <ImageIcon className="h-8 w-8 opacity-50" />
            <p className="text-sm">Resim seç veya buraya sürükle</p>
            <p className="text-[11px] opacity-70">JPG / PNG / WebP — maks 15 MB</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>
      {imageFile && (
        <p className="text-[11px] text-muted-foreground">
          Yeni resim seçildi: <span className="font-medium">{imageFile.name}</span> —
          kaydedince yüklenecek
        </p>
      )}
    </div>
  );
}
