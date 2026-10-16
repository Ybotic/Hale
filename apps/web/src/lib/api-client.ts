"use client";

import { useEffect, useState } from "react";

export class ApiClientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiRequest<T>(path: string, options: {
  method?: string;
  json?: unknown;
  body?: BodyInit | null;
  headers?: HeadersInit;
} = {}): Promise<T> {
  const headers = new Headers(options.headers);
  let body = options.body;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }
  const response = await fetch(`/api/backend/${path}`, {
    method: options.method ?? (options.json === undefined && options.body === undefined ? "GET" : "POST"),
    headers,
    body,
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) {
    let message = "The request could not be completed.";
    try {
      const result = await response.json() as { error?: unknown };
      if (typeof result.error === "string") message = result.error;
    } catch { /* Use the generic fallback for non-JSON errors. */ }
    throw new ApiClientError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function apiPath(route: string, values: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) query.set(key, value);
  return `${route}?${query.toString()}`;
}

export function useApiQuery<T>(path: string, enabled = true, refreshMs?: number) {
  const key = `${path}|${enabled}|${refreshMs ?? 0}`;
  const [state, setState] = useState<{ key: string; data?: T; error?: Error; loading: boolean }>({ key: "", loading: false });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = async () => {
      try {
        const result = await apiRequest<T>(path);
        if (active) setState({ key, data: result, loading: false });
      } catch (reason) {
        if (active) setState({ key, error: reason instanceof Error ? reason : new Error("Request failed."), loading: false });
      }
    };
    void load();
    const timer = refreshMs ? setInterval(() => { void load(); }, refreshMs) : undefined;
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [key, path, enabled, refreshMs]);
  const current = enabled && state.key === key;
  return { data: current ? state.data : undefined, error: current ? state.error : undefined, isLoading: enabled && (!current || state.loading) };
}
