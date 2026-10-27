import dns from "node:dns/promises";
import mongoose from "mongoose";

// Fix for Node.js v24 on Windows: SRV DNS queries may fail with ECONNREFUSED
// because Node does not always use the Windows system DNS resolver.
// See: https://alexbevi.com/blog/2023/11/13/querysrv-errors-when-connecting-to-mongodb-atlas/
// Sadece Windows (yerel geliştirme) — Vercel'in kendi DNS'ine dokunulmaz.
if (process.platform === "win32") {
  dns.setServers(["1.1.1.1", "8.8.8.8"]);
}

const MONGODB_URI = process.env.MONGODB_URI as string;
const MONGODB_URI_DIRECT = process.env.MONGODB_URI_DIRECT as string | undefined;
const CONNECT_RETRIES = Number(process.env.MONGODB_CONNECT_RETRIES ?? "2");

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is not defined");
}

function isSrvLookupFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { message?: unknown; cause?: unknown };
  const message =
    typeof maybeError.message === "string"
      ? maybeError.message
      : typeof maybeError.cause === "object" &&
          maybeError.cause &&
          "message" in maybeError.cause &&
          typeof (maybeError.cause as { message?: unknown }).message === "string"
        ? ((maybeError.cause as { message?: string }).message ?? "")
        : "";

  return /querySrv|ENOTFOUND|EAI_AGAIN|ETIMEOUT|ECONNREFUSED/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(uri: string, attempts: number): Promise<typeof mongoose> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await mongoose.connect(uri, {
        bufferCommands: false,
        // Sunucusuz ortamda her örnek kendi havuzunu açar; deploy anında eski ve
        // yeni örnekler birlikte çalışırken Atlas bağlantı sınırı aşılmasın.
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 8000,
      });
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await sleep(250 * attempt);
      }
    }
  }

  throw lastError;
}

/**
 * Next.js dev modunda hot-reload sırasında bağlantının çoğalmasını önlemek için
 * bağlantıyı global cache'e alıyoruz.
 */
declare global {
  var _mongooseCache: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
}

const cache = global._mongooseCache ?? { conn: null, promise: null };
global._mongooseCache = cache;

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = (async () => {
      const attempts = Number.isFinite(CONNECT_RETRIES)
        ? Math.min(Math.max(Math.trunc(CONNECT_RETRIES), 1), 5)
        : 2;

      try {
        return await connectWithRetry(MONGODB_URI, attempts);
      } catch (err) {
        const canRetryWithDirectUri =
          Boolean(MONGODB_URI_DIRECT) &&
          MONGODB_URI.startsWith("mongodb+srv://") &&
          isSrvLookupFailure(err);

        if (!canRetryWithDirectUri) {
          throw err;
        }

        console.warn("MongoDB SRV DNS lookup failed; retrying with MONGODB_URI_DIRECT");
        return connectWithRetry(MONGODB_URI_DIRECT as string, attempts);
      }
    })();
  }

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    // Başarısız bağlantı önbellekte kalırsa o örnekteki her istek 500 döner;
    // sıfırla ki sonraki istek yeniden denesin.
    cache.promise = null;
    throw err;
  }
  return cache.conn;
}
