// Dev only: /api/dev/trendyol-sim ile oluşturulmuş mock Trendyol siparişlerini siler.
// Mock siparişlerin externalRef'i "MOCK-DEV-" prefix'iyle başlar; gerçek
// Trendyol siparişlerinin externalRef formatı asla bu prefix ile başlamaz,
// dolayısıyla yanlışlıkla gerçek sipariş silmek mümkün değil.
//
// Kullanım:
//   POST /api/dev/trendyol-clear-mocks
//
// Production'da 404 döner.

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import OrderModel from "@/models/Order";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    await connectDB();
    const result = await OrderModel.deleteMany({
      source: "trendyol",
      externalRef: { $regex: "^MOCK-DEV-" },
    });

    revalidatePath("/orders");
    revalidatePath("/dashboard/trendyol");
    revalidatePath("/");

    return NextResponse.json({
      ok: true,
      deletedCount: result.deletedCount ?? 0,
    });
  } catch (error) {
    console.error("[trendyol-clear-mocks]", error);
    return NextResponse.json(
      { ok: false, error: "delete failed" },
      { status: 500 },
    );
  }
}
