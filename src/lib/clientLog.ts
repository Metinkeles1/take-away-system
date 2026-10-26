export type ClientLogInput = {
  kind: string;
  message?: string;
  details?: Record<string, unknown>;
};

const MAX_MESSAGE_LEN = 600;

function truncate(text: string, max = MAX_MESSAGE_LEN): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function sendClientLog(input: ClientLogInput) {
  if (typeof window === "undefined") return;

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
