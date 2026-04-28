import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message = text;
    try {
      const json = JSON.parse(text);
      message = json.error || json.message || text;
    } catch {
    }
    throw new Error(message);
  }
}

function getCsrfToken(): string | null {
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

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  try {
    console.log(`🚀 Making ${method} request to:`, url);
    
    const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
    const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
    
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
        console.warn('⚠️ CSRF token expired — refreshing and retrying...');
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

    console.log(`📥 Response status: ${res.status} for ${url}`);

    // If the server says we're not authenticated, force a re-check of the auth
    // state. This causes App.tsx to re-run /api/auth/me and show the login page
    // instead of leaving the user stranded on a page where every save fails.
    if (res.status === 401) {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    }

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    console.error(`❌ API request failed for ${method} ${url}:`, error);
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
      console.log(`🔍 Query request to:`, url);
      const res = await fetch(url, {
        credentials: "include",
      });

      if (res.status === 401) {
        if (unauthorizedBehavior === "returnNull") {
          console.log(`🔐 Unauthorized request to ${url}, returning null`);
          return null;
        }
        // For queries that throw on 401, still invalidate auth so the app
        // redirects to login rather than showing an error state
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      }

      console.log(`📥 Query response status: ${res.status} for ${url}`);
      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      console.error(`❌ Query failed for ${queryKey[0]}:`, error);
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
