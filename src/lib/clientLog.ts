export type ClientLogInput = {
  kind: string;
  message?: string;
  details?: Record<string, unknown>;
  dedupeKey?: string;
};

const MAX_MESSAGE_LEN = 600;
const ENABLE_CLIENT_LOGS = process.env.NEXT_PUBLIC_CLIENT_LOG_ENABLED !== "false";

type LogPolicy = {
  throttleMs?: number;
};

const LOG_POLICY: Record<string, LogPolicy> = {
  // Network probe can be noisy when a device is unstable.
  "healthz-fail": { throttleMs: 10 * 60 * 1000 },
  "network-online": { throttleMs: 60 * 1000 },
  "network-offline": { throttleMs: 60 * 1000 },
  "network-degraded": { throttleMs: 60 * 1000 },
  "network-recovered": { throttleMs: 60 * 1000 },
  "window-error": { throttleMs: 30 * 1000 },
  "unhandled-rejection": { throttleMs: 30 * 1000 },
  "error-boundary": { throttleMs: 30 * 1000 },
  "global-error-boundary": { throttleMs: 30 * 1000 },
};

const lastSentAtByKey = new Map<string, number>();

function truncate(text: string, max = MAX_MESSAGE_LEN): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function buildDedupeKey(input: ClientLogInput): string {
  if (input.dedupeKey) return input.dedupeKey;
  const base = `${input.kind}|${input.message ?? ""}`;
  return base.slice(0, 300);
}

function canSendNow(input: ClientLogInput): boolean {
  const policy = LOG_POLICY[input.kind];
  const throttleMs = policy?.throttleMs ?? 0;
  if (!throttleMs) return true;

  const key = buildDedupeKey(input);
  const now = Date.now();
  const last = lastSentAtByKey.get(key) ?? 0;
  if (now - last < throttleMs) {
    return false;
  }

  lastSentAtByKey.set(key, now);
  return true;
}

export function sendClientLog(input: ClientLogInput) {
  if (typeof window === "undefined") return;
  if (!ENABLE_CLIENT_LOGS) return;
  if (!canSendNow(input)) return;

  try {
    const payload = {
      at: Date.now(),
      kind: input.kind,
      message: input.message ? truncate(input.message) : undefined,
      path: window.location.pathname + window.location.search,
      href: window.location.href,
      online: navigator.onLine,
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      details: input.details,
    };

    const body = JSON.stringify(payload);

    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/client-logs", blob);
      return;
    }

    void fetch("/api/client-logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      cache: "no-store",
    });
  } catch {
    // Logging must never break the app.
  }
}
