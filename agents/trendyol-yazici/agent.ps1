# Trendyol Yazici - kasa bilgisayarinda calisan program.
# TRENDYOL-YAZICI-AGENT (kurulum dosyasi bu isareti arar; silmeyin)
#
# Ne yapar: ~20 sn'de bir siteye (/api/print-agent/poll) sorar. Sunucu yeni
# Trendyol siparislerini (tum isletmeler) otomatik kabul eder ve fis satirlarini
# dondurur; bu program onlari Windows yazicisina sessizce basar ve ses calar.
#
# Kurulum: Ayarlar'dan inen TrendyolYazici-Kurulum.bat bu dosyayi
# %LOCALAPPDATA%\TrendyolYazici\ altina indirir ve "-Install" ile calistirir:
#   - Windows acilisina gorunmez baslatici ekler (Startup\TrendyolYazici.vbs).
#     Baslatici program kapanirsa 15 sn sonra yeniden acar.
#   - Program sunucudaki surum degisince kendini gunceller (yeniden kurulum yok).
#   - Calisirken bilgisayarin uykuya gecmesini engeller (ekran kapanabilir).
# Kaldirma: sitede Ayarlar'dan "Kaldir" (bir sonraki yoklamada kendini kaldirir)
# ya da bu bilgisayarda klasordeki Kaldir.bat ("-Uninstall").
# Her kurulum kendine bir kimlik uretir (device.txt) -> birden cok bilgisayar
# Ayarlar'da ayri ayri gorunur ve yonetilir.
#
# NOT: Bu dosya ASCII tutulur (Windows PowerShell 5.1 BOM'suz dosyayi ANSI okur).
# Turkce metinler sunucudan JSON (UTF-8) olarak gelir.

param([switch]$Install, [switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$AppDir = Join-Path $env:LOCALAPPDATA 'TrendyolYazici'
$ScriptPath = Join-Path $AppDir 'agent.ps1'
$ConfigPath = Join-Path $AppDir 'config.json'
$LogPath = Join-Path $AppDir 'log.txt'
$DevicePath = Join-Path $AppDir 'device.txt'
# Arka plandaki program her basarili yoklamada buraya yazar; kurulum bununla
# programin gercekten calisip siteye ulastigini dogrular.
$StatusPath = Join-Path $AppDir 'status.txt'
$LauncherPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'TrendyolYazici.vbs'

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Drawing

# --- Yardimcilar -------------------------------------------------------------

function Write-Log([string]$msg) {
  try {
    if ((Test-Path $LogPath) -and ((Get-Item $LogPath).Length -gt 1MB)) {
      Move-Item $LogPath "$LogPath.old" -Force
    }
    $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $msg + "`r`n"
    [IO.File]::AppendAllText($LogPath, $line, [Text.Encoding]::UTF8)
  } catch {}
}

function Read-Config {
  $cfg = [IO.File]::ReadAllText($ConfigPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  if (-not $cfg.serverUrl -or -not $cfg.token) { throw 'config.json eksik' }
  return $cfg
}

function Invoke-Api($cfg, [string]$path, $body) {
  $c = New-Object Net.WebClient
  $c.Encoding = [Text.Encoding]::UTF8
  $c.Headers['Authorization'] = 'Bearer ' + $cfg.token
  $c.Headers['Content-Type'] = 'application/json; charset=utf-8'
  $json = $body | ConvertTo-Json -Depth 8 -Compress
  try {
    return ($c.UploadString($cfg.serverUrl.TrimEnd('/') + $path, 'POST', $json) | ConvertFrom-Json)
  } finally {
    $c.Dispose()
  }
}

# Bu kurulumun kalici kimligi (ilk calismada uretilir).
function Get-DeviceId {
  if (Test-Path $DevicePath) {
    $id = ([IO.File]::ReadAllText($DevicePath)).Trim()
    if ($id -match '^[A-Za-z0-9-]{8,64}$') { return $id }
  }
  $id = [guid]::NewGuid().ToString()
  [IO.File]::WriteAllText($DevicePath, $id, [Text.Encoding]::ASCII)
  return $id
}

# Acilistan cikar + kimligi sil. Calisan program kendisiyse cagiran cikar (99).
function Remove-Agent {
  if (Test-Path $LauncherPath) { Remove-Item $LauncherPath -Force }
  if (Test-Path $DevicePath) { Remove-Item $DevicePath -Force }
}

function Get-MyHash {
  return (Get-FileHash -Algorithm SHA1 -Path $ScriptPath).Hash.ToLower()
}

function Get-PrinterNames {
  return @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters | ForEach-Object { [string]$_ })
}

# Ayarlar'da secilen yazici; secilmediyse fis yazicisina benzeyen ilk yazici,
# o da yoksa Windows varsayilani.
function Resolve-Printer([string]$wanted) {
  $installed = Get-PrinterNames
  if ($wanted -and ($installed -contains $wanted)) { return $wanted }
  $real = $installed | Where-Object { $_ -notmatch 'PDF|XPS|Fax|OneNote|AnyDesk' }
  $hint = $real | Where-Object { $_ -match 'POS|Receipt|Thermal|Termal|XP-|TM-|80|58|Xprinter|Rongta|Gprinter|Bixolon|SRP|Epson TM' } | Select-Object -First 1
  if ($hint) { return $hint }
  return (New-Object System.Drawing.Printing.PrinterSettings).PrinterName
}

function Stop-OldAgents {
  Get-CimInstance Win32_Process -Filter "Name='wscript.exe' OR Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -like '*TrendyolYazici*' } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }
}

function Play-Alert {
  try {
    $wav = Join-Path $env:WINDIR 'Media\Alarm01.wav'
    if (Test-Path $wav) {
      $p = New-Object Media.SoundPlayer $wav
      $p.PlaySync()
    } else {
      1..3 | ForEach-Object { [Media.SystemSounds]::Exclamation.Play(); Start-Sleep -Milliseconds 700 }
    }
  } catch {}
}

# --- Yazdirma ----------------------------------------------------------------
# Sunucudan gelen satirlar (lib/printAgent/receipt.ts ile ayni sozlesme):
#   k=t  metin  (x, s=1..4 boyut, b=kalin, a=l/c/r hiza)
#   k=r  sol+sag (l, r, s, b)
#   k=hr kesik cizgi   k=sp bosluk
# Windows yazici surucusuyle cizilir -> Turkce karakter sorunu olmaz.

$script:FontPt = @{ 1 = 9; 2 = 11; 3 = 14; 4 = 18 }

function Get-Font($line) {
  $size = 1
  if ($line.s) { $size = [int]$line.s }
  $style = [System.Drawing.FontStyle]::Regular
  if ($line.b) { $style = [System.Drawing.FontStyle]::Bold }
  return New-Object System.Drawing.Font('Arial', [single]$script:FontPt[$size], $style)
}

function Print-Receipt([string]$printer, $lines) {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName = $printer
  if (-not $doc.PrinterSettings.IsValid) { throw "Yazici bulunamadi: $printer" }
  $doc.DocumentName = 'Trendyol Fis'
  $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)

  $script:PLines = @($lines)
  $script:PIndex = 0

  $doc.add_PrintPage({
    param($sender, $e)
    $g = $e.Graphics
    # Termal yazici tek renk: yumusatma kenarlari bulaniklastirir.
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
    $area = $e.PageSettings.PrintableArea
    $pad = [single]3
    $width = [single]([Math]::Max(120, $area.Width - 2 * $pad))
    $x = $pad
    $y = [single]2
    $bottom = [single]$area.Height
    $brush = [System.Drawing.Brushes]::Black

    while ($script:PIndex -lt $script:PLines.Count) {
      $line = $script:PLines[$script:PIndex]
      $h = [single]0
      switch ($line.k) {
        'hr' { $h = 14 }
        'sp' { $h = 22 }
        default {
          $font = Get-Font $line
          if ($line.k -eq 'r') {
            $rw = $g.MeasureString([string]$line.r, $font).Width
            $lw = [single]([Math]::Max(40, $width - $rw - 6))
            $lh = $g.MeasureString([string]$line.l, $font, [int]$lw).Height
            $h = [single]([Math]::Max($lh, $font.GetHeight($g)))
          } else {
            $h = $g.MeasureString([string]$line.x, $font, [int]$width).Height
          }
        }
      }
      # Sayfa doldu (rulo olmayan surucu) -> sonraki sayfada devam.
      if ($y + $h -gt $bottom -and $y -gt 10) { $e.HasMorePages = $true; return }

      switch ($line.k) {
        'hr' {
          $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1)
          $pen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
          $g.DrawLine($pen, $x, $y + 7, $x + $width, $y + 7)
          $pen.Dispose()
        }
        'sp' { }
        'r' {
          $rw = $g.MeasureString([string]$line.r, $font).Width
          $lw = [single]([Math]::Max(40, $width - $rw - 6))
          $g.DrawString([string]$line.l, $font, $brush, (New-Object System.Drawing.RectangleF($x, $y, $lw, $h)))
          $g.DrawString([string]$line.r, $font, $brush, [single]($x + $width - $rw), $y)
          $font.Dispose()
        }
        default {
          $fmt = New-Object System.Drawing.StringFormat
          if ($line.a -eq 'c') { $fmt.Alignment = [System.Drawing.StringAlignment]::Center }
          elseif ($line.a -eq 'r') { $fmt.Alignment = [System.Drawing.StringAlignment]::Far }
          $g.DrawString([string]$line.x, $font, $brush, (New-Object System.Drawing.RectangleF($x, $y, $width, $h)), $fmt)
          $fmt.Dispose()
          $font.Dispose()
        }
      }
      $y += $h
      $script:PIndex++
    }
    $e.HasMorePages = $false
  })

  try { $doc.Print() } finally { $doc.Dispose() }
}

# --- Kurulum / kaldirma ------------------------------------------------------

if ($Uninstall) {
  Remove-Agent
  Stop-OldAgents
  Write-Host ''
  Write-Host '  Trendyol Yazici kaldirildi. Artik otomatik baslamayacak.'
  Write-Host '  (Klasoru silmek isterseniz:' $AppDir ')'
  exit 0
}

if ($Install) {
  try {
    $cfg = Read-Config
    Stop-OldAgents

    # Gorunmez baslatici: Windows acilisinda calisir, program kapanirsa yeniden acar.
    # 99 = baska kopya zaten calisiyor -> baslatici da cikar.
    $vbs = @(
      "' Trendyol Yazici - Windows acilisinda gorunmez baslatici",
      'Set sh = CreateObject("WScript.Shell")',
      'script = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\TrendyolYazici\agent.ps1"',
      'Do',
      '  rc = sh.Run("powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & script & """", 0, True)',
      '  If rc = 99 Then Exit Do',
      '  WScript.Sleep 15000',
      'Loop'
    ) -join "`r`n"
    [IO.File]::WriteAllText($LauncherPath, $vbs, [Text.Encoding]::ASCII)

    $un = @(
      '@echo off',
      'powershell -NoProfile -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\TrendyolYazici\agent.ps1" -Uninstall',
      'pause'
    ) -join "`r`n"
    [IO.File]::WriteAllText((Join-Path $AppDir 'Kaldir.bat'), $un, [Text.Encoding]::ASCII)

    # Baglantiyi dogrula + yazicilari hemen bildir (Ayarlar'da liste gorunsun).
    Write-Host '  Siteye baglaniliyor:' $cfg.serverUrl
    $printers = Get-PrinterNames
    $resp = Invoke-Api $cfg '/api/print-agent/poll' @{ deviceId = (Get-DeviceId); host = $env:COMPUTERNAME; version = (Get-MyHash); printers = @($printers) }
    # Bizim sunucu "ok: true" doner; baska bir sayfa (giris, hata, guvenlik
    # duvari) 200 donse bile kurulum basarili sayilmaz.
    if (-not $resp -or $resp.ok -ne $true) { throw 'Siteden beklenen yanit gelmedi (adres ya da guvenlik duvari sorunu).' }
    Write-Host '  Siteye baglanildi. Bilgisayar Ayarlar listesine eklendi.'

    # Arka plan programini baslat ve gercekten calistigini bekle.
    if (Test-Path $StatusPath) { Remove-Item $StatusPath -Force }
    $startedAt = Get-Date
    Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + $LauncherPath + '"')
    Write-Host '  Arka plan programi baslatiliyor (en fazla 45 sn)...'
    $running = $false
    for ($i = 0; $i -lt 45; $i++) {
      Start-Sleep -Seconds 1
      if ((Test-Path $StatusPath) -and ((Get-Item $StatusPath).LastWriteTime -ge $startedAt.AddSeconds(-2))) { $running = $true; break }
    }
    if (-not $running) {
      $why = ''
      if (-not (Test-Path $LauncherPath)) { $why = ' Baslatici dosyasi silinmis: antivirus engellemis olabilir.' }
      elseif (-not (Test-Path $ScriptPath)) { $why = ' Program dosyasi silinmis: antivirus engellemis olabilir.' }
      throw ('Arka plan programi calismadi.' + $why + ' Ayrinti: ' + $LogPath)
    }
    Write-Log 'Kuruldu.'

    Write-Host '  Arka plan programi calisiyor.'
    Write-Host '  Bulunan yazicilar:'
    foreach ($p in $printers) { Write-Host '    -' $p }
    Write-Host '  Secilen yazici:' (Resolve-Printer '')
    Write-Host '  (Yaziciyi sitede Ayarlar > Trendyol Otomatik Kabul bolumunden degistirebilirsiniz.)'
    exit 0
  } catch {
    $msg = $_.Exception.Message
    Write-Host ''
    Write-Host '  HATA:' $msg
    if ($msg -match 'SSL|TLS|secure channel|guvenli kanal') {
      Write-Host '  -> Bu bilgisayarin Windows/.NET surumu guncel guvenli baglantiyi desteklemiyor olabilir. Windows Update yapin.'
    } elseif ($msg -match '\(401\)') {
      Write-Host '  -> Baglanti anahtari gecersiz. Ayarlar sayfasindan kurulum dosyasini yeniden indirin.'
    } elseif ($msg -match 'antivirus|silinmis|calismadi') {
      Write-Host '  -> Windows Guvenligi > Virus ve tehdit koruma > Koruma gecmisi bolumunden'
      Write-Host '     TrendyolYazici dosyasina "Izin ver" deyin ve kurulumu tekrar calistirin.'
    }
    Write-Log ('Kurulum hatasi: ' + $msg)
    exit 1
  }
}

# --- Ana dongu ---------------------------------------------------------------

# Tek kopya: ikinci kopya hemen cikar (99 -> baslatici da durur).
$created = $false
$mutex = New-Object Threading.Mutex($true, 'Local\TrendyolYazici', [ref]$created)
if (-not $created) { exit 99 }

# Calisirken bilgisayar uykuya gecmesin (ES_CONTINUOUS | ES_SYSTEM_REQUIRED).
try {
  Add-Type -Namespace TY -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
  [TY.Power]::SetThreadExecutionState([uint32]2147483649) | Out-Null
} catch { Write-Log ('Uyku engellenemedi: ' + $_.Exception.Message) }

$myHash = Get-MyHash
$deviceId = Get-DeviceId
Write-Log ('Basladi. Surum ' + $myHash.Substring(0, 8))

$printed = New-Object 'System.Collections.Generic.HashSet[string]'
$printersSentAt = [DateTime]::MinValue
$updateBlockedUntil = [DateTime]::MinValue
$interval = 20

while ($true) {
  $sleep = $interval
  try {
    $cfg = Read-Config
    $body = @{ deviceId = $deviceId; host = $env:COMPUTERNAME; version = $myHash }
    if (((Get-Date) - $printersSentAt).TotalMinutes -ge 5) {
      $body.printers = @(Get-PrinterNames)
      $printersSentAt = Get-Date
    }
    $resp = Invoke-Api $cfg '/api/print-agent/poll' $body
    try { [IO.File]::WriteAllText($StatusPath, (Get-Date -Format 'o'), [Text.Encoding]::ASCII) } catch {}

    # Sitede Ayarlar'dan "Kaldir" denmis -> acilistan cik ve dur (99 = baslatici da durur).
    if ($resp.uninstall) {
      Remove-Agent
      Write-Log 'Siteden kaldirildi.'
      $mutex.ReleaseMutex()
      exit 99
    }
    if ($resp.intervalSec) { $interval = [Math]::Max(10, [int]$resp.intervalSec) }

    # Fisler
    $results = @()
    $printedAny = $false
    foreach ($job in @($resp.jobs)) {
      if (-not $job -or -not $job.id) { continue }
      if ($printed.Contains([string]$job.id)) {
        $results += @{ id = [string]$job.id; ok = $true }
        continue
      }
      # Istasyon fisi (Ocakbasi/Firin...) kendi yazicisini tasir; yoksa bilgisayarin yazicisi.
      $wanted = [string]$resp.printerName
      if ($job.printer) { $wanted = [string]$job.printer }
      $printer = Resolve-Printer $wanted
      try {
        Print-Receipt $printer $job.lines
        [void]$printed.Add([string]$job.id)
        $results += @{ id = [string]$job.id; ok = $true }
        $printedAny = $true
        Write-Log ('Basildi: ' + $job.id + ' -> ' + $printer)
      } catch {
        $results += @{ id = [string]$job.id; ok = $false; error = ($printer + ': ' + $_.Exception.Message) }
        Write-Log ('Basilamadi: ' + $job.id + ' -> ' + $printer + ': ' + $_.Exception.Message)
      }
    }
    if ($results.Count -gt 0) {
      Invoke-Api $cfg '/api/print-agent/ack' @{ deviceId = $deviceId; results = @($results) } | Out-Null
    }
    if ($printedAny) { Play-Alert }

    # Kendini guncelle: sunucudaki dosya degistiyse indir, cik (baslatici yeniden acar).
    if ($resp.scriptHash -and $resp.scriptHash -ne $myHash -and (Get-Date) -gt $updateBlockedUntil) {
      $tmp = Join-Path $AppDir 'agent.new.ps1'
      $wc = New-Object Net.WebClient
      try { $wc.DownloadFile($cfg.serverUrl.TrimEnd('/') + '/api/print-agent/script', $tmp) } finally { $wc.Dispose() }
      $newHash = (Get-FileHash -Algorithm SHA1 -Path $tmp).Hash.ToLower()
      if ($newHash -eq $resp.scriptHash) {
        Move-Item $tmp $ScriptPath -Force
        Write-Log ('Guncellendi -> ' + $newHash.Substring(0, 8) + ', yeniden baslatiliyor.')
        $mutex.ReleaseMutex()
        exit 0
      }
      Remove-Item $tmp -Force -ErrorAction SilentlyContinue
      Write-Log 'Guncelleme dosyasi dogrulanamadi; 1 saat sonra tekrar denenecek.'
      $updateBlockedUntil = (Get-Date).AddHours(1)
    }
  } catch {
    $msg = $_.Exception.Message
    Write-Log ('Hata: ' + $msg)
    # Anahtar gecersiz (yeniden kurulum gerekebilir) -> siteyi yorma.
    if ($msg -match '\(401\)') { $sleep = 300 }
  }
  Start-Sleep -Seconds $sleep
}
