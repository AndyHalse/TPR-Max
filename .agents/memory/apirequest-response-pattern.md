---
name: apiRequest returns Response not JSON
description: apiRequest() in queryClient.ts returns a raw fetch Response object, not parsed JSON. Failing to call .json() silently produces undefined fields.
---

## The Rule

`apiRequest(method, url, body?)` always returns `Promise<Response>` — a raw fetch `Response` object. You must call `.json()` on it to get the parsed payload.

**Wrong:**
```ts
const data: any = await apiRequest("POST", "/api/foo", body);
data.someField; // undefined — data is a Response object
```

**Correct:**
```ts
const res = await apiRequest("POST", "/api/foo", body);
const data = await res.json();
data.someField; // works
```

**In useMutation, parse inside mutationFn (not onSuccess):**
```ts
const mutation = useMutation({
  mutationFn: async () => {
    const res = await apiRequest("POST", "/api/foo", body);
    return res.json(); // onSuccess receives parsed JSON
  },
  onSuccess: (data) => { /* data is parsed JSON here */ },
});
```

**Why:** `apiRequest` is designed to throw on non-OK responses (via `throwIfResNotOk`) and return the Response for flexibility. The query helper (`getQueryFn`) does call `.json()` internally, but `apiRequest` itself does not.

**How to apply:** Any time you use `apiRequest("GET"|"POST"|..., ...)` and access properties on the result — always add `.json()`. The pattern breaks silently otherwise (no error thrown, just `undefined` fields).
