"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { memo } from "react";

interface Props {
  notes: string;
}

const OrderNotesCard = memo(function OrderNotesCard({ notes }: Props) {
  if (!notes) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Sipariş Notu</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm">{notes}</p>
      </CardContent>
    </Card>
  );
});

export default OrderNotesCard;
