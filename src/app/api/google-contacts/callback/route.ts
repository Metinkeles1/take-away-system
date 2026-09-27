import { NextRequest, NextResponse } from "next/server";
import {
  CALLBACK_PATH,
  exchangeCode,
  patchGoogleContactsSetting,
  readGoogleContactsSetting,
} from "@/lib/integrations/googleContacts";

// Google izin sayfasından dönüş: kodu refresh token'a çevirip kaydeder ve
// Ayarlar'a geri yollar (?google=connected | error).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (status: string, msg?: string) => {
    const url = new URL("/settings", origin);
    url.searchParams.set("google", status);
    if (msg) url.searchParams.set("msg", msg.slice(0, 200));
    const res = NextResponse.redirect(url);
    res.cookies.delete("gc_oauth_state");
    return res;
  };

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return back("error", params.get("error")!);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state || state !== req.cookies.get("gc_oauth_state")?.value) {
    return back("error", "Geçersiz dönüş, tekrar deneyin");
  }

  try {
    const setting = await readGoogleContactsSetting();
    const { refreshToken, email } = await exchangeCode(
      setting,
      code,
      `${origin}${CALLBACK_PATH}`,
    );
    await patchGoogleContactsSetting({
      refreshToken,
      email,
      connectedAt: new Date(),
    });
    return back("connected");
  } catch (err) {
    console.error("[google-contacts/callback]", err);
    return back("error", err instanceof Error ? err.message : "Bağlanılamadı");
  }
}
