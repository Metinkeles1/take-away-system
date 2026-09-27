import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  CALLBACK_PATH,
  buildAuthUrl,
  readGoogleContactsSetting,
} from "@/lib/integrations/googleContacts";

// Ayarlar → "Google ile Bağlan": Google izin sayfasına yönlendirir. Dönüş
// adresi isteğin geldiği alan adından türetilir (localhost / Vercel ikisi de).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const setting = await readGoogleContactsSetting();
  if (!setting.clientId || !setting.clientSecret) {
    return NextResponse.redirect(`${origin}/settings?google=missing-client`);
  }
  // state: dönüşün bu tarayıcıdan başlatılan akışa ait olduğunu doğrular.
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(
    buildAuthUrl(setting, `${origin}${CALLBACK_PATH}`, state),
  );
  res.cookies.set("gc_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https"),
    maxAge: 600,
    path: "/",
  });
  return res;
}
