/** Tiny fetch wrapper for client components calling our own API routes. */

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  code: string | null;
}

export async function api<T = unknown>(path: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
    if (res.status === 401) {
      // Session expired: a full reload to /login (not client navigation) drops all stale client state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
    return {
      ok: res.ok,
      status: res.status,
      data: res.ok ? json : null,
      error: res.ok ? null : (json?.error ?? `Request failed (${res.status})`),
      code: res.ok ? null : (json?.code ?? null),
    };
  } catch {
    return { ok: false, status: 0, data: null, error: "Could not reach the server. Check your connection.", code: "NETWORK" };
  }
}
