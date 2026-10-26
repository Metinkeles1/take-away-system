"use client";

import { useEffect } from "react";
import { sendClientLog } from "@/lib/clientLog";

function safeMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function RuntimeErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      sendClientLog({
        kind: "window-error",
        message: event.message || "window error",
        details: {
          file: event.filename,
          line: event.lineno,
          column: event.colno,
        },
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      sendClientLog({
        kind: "unhandled-rejection",
        message: safeMessage(event.reason),
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
