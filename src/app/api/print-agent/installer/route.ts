import { NextRequest, NextResponse } from "next/server";
import { ensurePrintAgentConfig, patchPrintAgentConfig } from "@/lib/printAgent/agent";

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
  // Ayarlar kartı "indirildi ama sinyal gelmedi" uyarısı için.
  await patchPrintAgentConfig({ installerAt: new Date().toISOString() }).catch(() => undefined);

  const scriptUrl = `${origin}/api/print-agent/script`;
  const agent = '"%TY_DIR%\\agent.ps1"';
  // İndirilen dosya gerçekten program mı? (hata/giriş sayfası ya da antivirüsün
  // boşalttığı dosya değil) — agent.ps1'in başındaki işaret aranır.
  const check = `findstr /c:"TRENDYOL-YAZICI-AGENT" ${agent} >nul 2>nul`;

  const lines = [
    "@echo off",
    "title Trendyol Yazici - Kurulum",
    "echo.",
    "echo   Trendyol Yazici kuruluyor, lutfen bekleyin...",
    "echo.",
    'set "TY_DIR=%LOCALAPPDATA%\\TrendyolYazici"',
    'if not exist "%TY_DIR%" mkdir "%TY_DIR%"',
    `> "%TY_DIR%\\config.json" echo {"serverUrl":"${origin}","token":"${token}"}`,
    `if exist ${agent} del /f /q ${agent}`,
    "echo   Program indiriliyor...",
    // Önce Windows'un kendi curl'ü (Win10 1803+): PowerShell indirme komutu
    // antivirüslerce daha sık engelleniyor. Olmazsa PowerShell ile dene.
    `where curl.exe >nul 2>nul && curl.exe -fsSL --retry 2 -o ${agent} "${scriptUrl}"`,
    `${check} || (`,
    `  if exist ${agent} del /f /q ${agent}`,
    `  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('${scriptUrl}', (Join-Path $env:LOCALAPPDATA 'TrendyolYazici\\agent.ps1'))"`,
    ")",
    `${check} || goto faildl`,
    `powershell -NoProfile -ExecutionPolicy Bypass -File ${agent} -Install`,
    // "if errorlevel 1" eksi kodları (dosya yok / antivirüs engeli = -196608)
    // kaçırıyordu → kurulum çalışmadan "tamamlandı" diyordu. Sıfır değilse hata.
    'if not "%errorlevel%"=="0" goto fail',
    "echo.",
    "echo   KURULUM TAMAMLANDI.",
    "echo   Program arka planda calisiyor; bilgisayar her acildiginda",
    "echo   kendiliginden baslar. Sitede Ayarlar sayfasinda bu bilgisayar",
    "echo   'Calisiyor' olarak gorunmeli. Bu pencereyi kapatabilirsiniz.",
    "echo.",
    "pause",
    "exit /b 0",
    ":faildl",
    "echo.",
    "echo   HATA: Program dosyasi indirilemedi ya da antivirus tarafindan silindi.",
    "echo   - Internet baglantisini kontrol edin.",
    "echo   - Windows Guvenligi ^> Virus ve tehdit koruma ^> Koruma gecmisi",
    "echo     bolumunde TrendyolYazici engellendiyse 'Izin ver' deyin.",
    "echo   Sonra bu dosyayi tekrar calistirin.",
    "echo.",
    "pause",
    "exit /b 1",
    ":fail",
    "echo.",
    "echo   HATA: Kurulum tamamlanamadi (ayrinti yukarida).",
    "echo   Kayit dosyasi: %TY_DIR%\\log.txt",
    "echo   Sorunu giderip bu dosyayi tekrar calistirin.",
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
