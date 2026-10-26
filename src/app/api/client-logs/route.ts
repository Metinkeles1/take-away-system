import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import ClientRuntimeLogModel from "@/models/ClientRuntimeLog";

export const runtime = "nodejs";

function safeString(value: unknown, max = 800): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function toBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const kind = safeString(body.kind, 120);
    if (!kind) {
      return NextResponse.json({ ok: false, error: "kind required" }, { status: 400 });
    }

    const atRaw = typeof body.at === "number" ? body.at : Date.now();
    const at = Number.isFinite(atRaw) ? new Date(atRaw) : new Date();

    await connectDB();
    await ClientRuntimeLogModel.create({
      at,
      kind,
      message: safeString(body.message),
      path: safeString(body.path, 300),
      href: safeString(body.href, 600),
      online: toBool(body.online),
      userAgent: safeString(body.userAgent, 400),
      language: safeString(body.language, 40),
      platform: safeString(body.platform, 80),
      details:
        body.details && typeof body.details === "object" ? body.details : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("client log write failed", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

export async function GET(req: Request) {
  const token = process.env.CLIENT_LOG_READ_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "CLIENT_LOG_READ_TOKEN not configured" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  if (searchParams.get("token") !== token) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const limitRaw = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  await connectDB();
  const rows = await ClientRuntimeLogModel.find({})
    .sort({ at: -1 })
    .limit(limit)
    .lean();

  return NextResponse.json({ ok: true, rows });
}
