"use client";

export async function backendRequest<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    throw new Error(
      typeof json === "object" && json && "error" in json && json.error
        ? json.error
        : `Request failed with ${response.status}`,
    );
  }
  return json as T;
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
