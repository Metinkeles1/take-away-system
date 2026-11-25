import { NextRequest, NextResponse } from "next/server";
import { ensurePrintAgentConfig } from "@/lib/printAgent/agent";

// Ayarlar → "Trendyol Otomatik Kabul ve Yazıcı" → "Kurulum dosyasını indir".
// Tek bir .bat döner: çift tıklanınca programı %LOCALAPPDATA%\TrendyolYazici'ye
// kurar, bu sitenin adresini + cihaz anahtarını yazar, Windows açılışına ekler
// ve başlatır. Yönetici izni gerekmez. Metin ASCII tutulur (cmd kod sayfası).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  // Adres .bat içine gömülüyor → cmd için özel karakter içermemeli.
  if (!/^https?:\/\/[A-Za-z0-9.\-]+(:\d+)?$/.test(origin)) {
    return NextResponse.json({ error: "geçersiz site adresi" }, { status: 400 });
  }
  const { token } = await ensurePrintAgentConfig();

  const lines = [
    "@echo off",
    "title Trendyol Yazici - Kurulum",
    "echo.",
    "echo   Trendyol Yazici kuruluyor, lutfen bekleyin...",
    "echo.",
    'set "TY_DIR=%LOCALAPPDATA%\TrendyolYazici"',
    'if not exist "%TY_DIR%" mkdir "%TY_DIR%"',
    `> "%TY_DIR%\config.json" echo {"serverUrl":"${origin}","token":"${token}"}`,
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('${origin}/api/print-agent/script', (Join-Path $env:LOCALAPPDATA 'TrendyolYazici\agent.ps1'))"`,
    "if errorlevel 1 goto fail",
    'powershell -NoProfile -ExecutionPolicy Bypass -File "%TY_DIR%\agent.ps1" -Install',
    "if errorlevel 1 goto fail",
    "echo.",
    "echo   KURULUM TAMAMLANDI.",
    "echo   Program arka planda calisiyor; bilgisayar her acildiginda",
    "echo   kendiliginden baslar. Bu pencereyi kapatabilirsiniz.",
    "echo.",
    "pause",
    "exit /b 0",
    ":fail",
    "echo.",
    "echo   HATA: Kurulum tamamlanamadi. Internet baglantisini kontrol edip",
    "echo   dosyayi tekrar calistirin.",
    "echo.",
    "pause",
    "exit /b 1",
    "",
  ];

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="TrendyolYazici-Kurulum.bat"',
      "Cache-Control": "no-store",
    },
  });
}
