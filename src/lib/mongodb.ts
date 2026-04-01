import dns from "node:dns/promises";
import mongoose from "mongoose";

// Fix for Node.js v24 on Windows: SRV DNS queries may fail with ECONNREFUSED
// because Node does not always use the Windows system DNS resolver.
// See: https://alexbevi.com/blog/2023/11/13/querysrv-errors-when-connecting-to-mongodb-atlas/
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const MONGODB_URI = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is not defined");
}

/**
 * Next.js dev modunda hot-reload sırasında bağlantının çoğalmasını önlemek için
 * bağlantıyı global cache'e alıyoruz.
 */
declare global {
  // eslint-disable-next-line no-var
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
    cache.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
