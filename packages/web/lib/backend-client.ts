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

function getBackendAuthHeader() {
  if (typeof window === "undefined") {
    return {};
  }
  const token = window.localStorage.getItem("aura:backend-auth-token");
  if (!token) {
    return {};
  }
  try {
    const parsed = JSON.parse(token) as string;
    const normalized = parsed.trim();
    if (!normalized) {
      return {};
    }
    return { authorization: `Bearer ${normalized}` };
  } catch {
    return {};
  }
}

export async function backendRequest<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  for (const [key, value] of Object.entries(getBackendAuthHeader())) {
    headers.set(key, value);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
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
