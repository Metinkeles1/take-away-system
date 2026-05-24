"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useReactToPrint } from "react-to-print";
import { toast } from "sonner";
import { useOrderStore } from "@/store/orderStore";

interface UseOrderSubmitResult {
  isSubmitting: boolean;
  receiptRef: React.RefObject<HTMLDivElement | null>;
  /** Yeni sipariş tamamla. alsoPrint=true ise tamamla + yazdır. */
  onComplete: (alsoPrint: boolean) => Promise<void>;
  /** Düzenleme modunda değişiklikleri kaydet. */
  onSaveEdit: () => Promise<void>;
  /** Düzenlemeyi iptal et — draft'ı sıfırla, geri dön. */
  onCancel: () => void;
}

// Sipariş tamamla/güncelle/iptal akışlarının tek noktası. UI'dan ayrı,
// rota değişimi + toast + print orkestrasyonu burada toplanır.
export function useOrderSubmit(): UseOrderSubmitResult {
  const router = useRouter();
  const completeOrder = useOrderStore((s) => s.completeOrder);
  const saveEdit = useOrderStore((s) => s.saveEdit);
  const resetDraft = useOrderStore((s) => s.resetDraft);
  const setPayment = useOrderStore((s) => s.setPayment);
  const editingOrderId = useOrderStore((s) => s.editingOrderId);
  const draftPaymentMethod = useOrderStore((s) => s.draft.payment.method);

  const receiptRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: "Siparis-Fis",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const onComplete = useCallback(
    async (alsoPrint: boolean) => {
      if (isSubmitting) return;
      // Defansif: edit modunda yeni sipariş oluşturulmasın (duplicate'i önler)
      if (editingOrderId) {
        console.warn("[useOrderSubmit] onComplete edit modunda çağrıldı");
        return;
      }
      setIsSubmitting(true);
      if (!draftPaymentMethod) {
        setPayment({ method: "cash" });
      }
      try {
        const order = await completeOrder();
        if (!order) {
          toast.error("Lütfen müşteri ve ödeme bilgilerini doldurun.");
          setIsSubmitting(false);
          return;
        }
        toast.success(`#${order.orderNumber} numaralı sipariş alındı!`);
        if (alsoPrint) {
          // Print bitsin (veya iptal edilsin), receiptRef unmount olmadan önce
          try {
            await handlePrint();
          } catch {
            // print iptal edilmiş olabilir — sipariş yine de tamamlandı
          }
        }
        resetDraft();
        router.push(`/orders/${order.id}`);
      } catch {
        toast.error("Sipariş kaydedilirken bir hata oluştu.");
        setIsSubmitting(false);
      }
    },
    [
      completeOrder,
      draftPaymentMethod,
      editingOrderId,
      handlePrint,
      isSubmitting,
      resetDraft,
      router,
      setPayment,
    ],
  );

  const onSaveEdit = useCallback(async () => {
    if (isSubmitting || !editingOrderId) return;
    setIsSubmitting(true);
    try {
      const result = await saveEdit();
      if (!result.ok) {
        toast.error(result.error ?? "Güncelleme başarısız");
        setIsSubmitting(false);
        return;
      }
      toast.success("Sipariş güncellendi");
      const id = result.id!;
      resetDraft();
      router.push(`/orders/${id}`);
      router.refresh();
    } catch {
      toast.error("Güncelleme sırasında bir hata oluştu.");
      setIsSubmitting(false);
    }
  }, [editingOrderId, isSubmitting, resetDraft, router, saveEdit]);

  const onCancel = useCallback(() => {
    const id = editingOrderId;
    resetDraft();
    if (id) router.push(`/orders/${id}`);
    else router.back();
  }, [editingOrderId, resetDraft, router]);

  return { isSubmitting, receiptRef, onComplete, onSaveEdit, onCancel };
}
