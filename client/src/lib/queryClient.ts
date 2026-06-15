import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message = text;
    let jsonData: Record<string, unknown> = {};
    try {
      jsonData = JSON.parse(text);
      message = (jsonData.error as string) || (jsonData.message as string) || text;
    } catch {
    }
    const error: any = new Error(message);
    error.status = res.status;
    Object.assign(error, jsonData);
    throw error;
  }
}

export function getCsrfToken(): string | null {
  const cookies = document.cookie.split(';');
  const csrfCookie = cookies.find(c => c.trim().startsWith('csrf-token='));
  if (csrfCookie) {
    return csrfCookie.split('=')[1];
  }
  return null;
}

async function fetchFreshCsrfToken(): Promise<string | null> {
  try {
    await fetch('/api/csrf-token', { credentials: 'include' });
    return getCsrfToken();
  } catch {
    return null;
  }
}

export function getSessionToken(): string | null {
  try {
    return sessionStorage.getItem('session_token');
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  try {
    sessionStorage.setItem('session_token', token);
  } catch {
    // ignore — sessionStorage unavailable (e.g. private browsing restrictions)
  }
}

/**
 * Appends the current Bearer session token as ?token=... to any /objects/...
 * URL so that <img> tags (which can't send Authorization headers) can still
 * load auth-protected uploads when the session cookie has expired.
 */
export function objectUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  const token = getSessionToken();
  if (!token) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}token=${encodeURIComponent(token)}`;
}

export function clearSessionToken(): void {
  try {
    sessionStorage.removeItem('session_token');
  } catch {
    // ignore
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  try {
    const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
    const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};

    // Add per-tab session token (multi-window customer isolation)
    const sessionToken = getSessionToken();
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    
    // Add CSRF token for non-safe methods
    if (isMutating) {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers['x-csrf-token'] = csrfToken;
      }
    }
    
    let res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    // If we got a CSRF error, refresh the token and retry once
    if (res.status === 403 && isMutating) {
      const body = await res.clone().json().catch(() => ({}));
      if (body?.code === 'CSRF_INVALID') {
        const freshToken = await fetchFreshCsrfToken();
        if (freshToken) {
          headers['x-csrf-token'] = freshToken;
          res = await fetch(url, {
            method,
            headers,
            body: data ? JSON.stringify(data) : undefined,
            credentials: "include",
          });
        }
      }
    }

    // If the server says we're not authenticated, force a re-check of the auth
    // state. This causes App.tsx to re-run /api/auth/me and show the login page
    // instead of leaving the user stranded on a page where every save fails.
    if (res.status === 401) {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    }

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    try {
      // Extract just the first element (the actual API endpoint URL) from queryKey
      // All subsequent elements are for cache partitioning only
      const url = queryKey[0] as string;
      const fetchHeaders: Record<string, string> = {};
      const sessionToken = getSessionToken();
      if (sessionToken) {
        fetchHeaders['Authorization'] = `Bearer ${sessionToken}`;
      }
      const res = await fetch(url, {
        credentials: "include",
        headers: fetchHeaders,
      });

      if (res.status === 401) {
        if (unauthorizedBehavior === "returnNull") {
          return null;
        }
        // For queries that throw on 401, still invalidate auth so the app
        // redirects to login rather than showing an error state
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      console.error('Query failed:', error);
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
