import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { createZip, type ZipEntry } from "@/lib/zip";

// Ayarlar → "Yemeksepeti Köprüsü" → "Eklentiyi indir".
// extensions/yemeksepeti klasörünü zip'ler; içine bu sitenin adresi ve
// bağlantı anahtarı (config.json) hazır konur → kasada elle giriş gerekmez.
// Dosyalar Vercel paketine next.config.ts → outputFileTracingIncludes ile girer.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXT_DIR = path.join(process.cwd(), "extensions", "yemeksepeti");
const FOLDER = "yemeksepeti-kopru";

export async function GET(req: NextRequest) {
  const token = process.env.YEMEKSEPETI_INGEST_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "YEMEKSEPETI_INGEST_TOKEN tanımlı değil" },
      { status: 503 },
    );
  }

  const origin = req.nextUrl.origin;
  let names: string[];
  try {
    names = (await fs.readdir(EXT_DIR, { withFileTypes: true }))
      .filter((d) => d.isFile() && d.name !== "config.json")
      .map((d) => d.name);
  } catch (err) {
    console.error("[GET /api/yemeksepeti/extension]", err);
    return NextResponse.json({ error: "eklenti dosyaları bulunamadı" }, { status: 500 });
  }

  const entries: ZipEntry[] = [];
  for (const name of names.sort()) {
    let data = await fs.readFile(path.join(EXT_DIR, name));
    if (name === "manifest.json") {
      // Bu siteye gönderme izni kurulumda verilsin (ayrı onay penceresi çıkmasın).
      const manifest = JSON.parse(data.toString("utf8"));
      manifest.host_permissions = [`${origin}/*`];
      data = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
    }
    entries.push({ name: `${FOLDER}/${name}`, data });
  }
  entries.push({
    name: `${FOLDER}/config.json`,
    data: Buffer.from(JSON.stringify({ serverUrl: origin, token }, null, 2), "utf8"),
  });

  return new NextResponse(new Uint8Array(createZip(entries)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${FOLDER}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
