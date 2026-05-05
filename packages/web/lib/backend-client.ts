"use client";

interface BackendErrorPayload {
  code?: string;
  message?: string;
  details?: unknown;
}

interface BackendEnvelope<T> {
  ok?: boolean;
  data?: T;
  error?: BackendErrorPayload | string;
  meta?: {
    requestId?: string;
    timestamp?: string;
  };
}

const DEFAULT_TIMEOUT_MS = 15_000;

export async function backendRequest<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    DEFAULT_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      credentials: init?.credentials ?? "include",
      signal: init?.signal ?? controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `Backend request timed out after ${DEFAULT_TIMEOUT_MS}ms`,
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`Backend returned non-JSON response (${response.status})`);
  }

  const json = (await response.json()) as
    | T
    | BackendEnvelope<T>
    | { error?: string };

  const isEnvelope =
    typeof json === "object" &&
    json !== null &&
    ("ok" in json || "data" in json || "error" in json);

  const envelope = isEnvelope ? (json as BackendEnvelope<T>) : undefined;
  const payload = envelope?.data ?? (json as T);

  if (!response.ok) {
    const errorMessage =
      typeof envelope?.error === "string"
        ? envelope.error
        : envelope?.error?.message;
    const legacyError =
      typeof json === "object" && json && "error" in json
        ? typeof json.error === "string"
          ? json.error
          : undefined
        : undefined;

    throw new Error(
      errorMessage
        ? envelope?.meta?.requestId
          ? `${errorMessage} (${envelope.meta.requestId})`
          : errorMessage
        : legacyError
          ? legacyError
          : `Request failed with ${response.status}`,
    );
  }

  return payload as T;
}

export function postBackend<T>(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
) {
  return backendRequest<T>(baseUrl, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
