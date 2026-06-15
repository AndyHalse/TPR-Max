# Fix — Staff photo upload silently fails for normal-sized photos (verified against live codebase 15 June 2026)

## The problem (read this first)

On the **Staff** page, opening a staff member's profile and clicking the camera button to upload a photo has stopped working for most real photos. The user picks an image, the spinner flickers, and they get a generic **"Failed to upload photo"** toast with no explanation. Small/old images sometimes work; photos straight off a modern phone or camera almost always fail.

### Root cause — the photo is too big for the request, and we never shrink it first

Here is the upload handler, `handleStaffPhotoUpload` in `client/src/pages/StaffManagement.tsx` (around line 334):

```ts
base64 = await new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (ev) => resolve((ev.target?.result as string).split(',')[1]);
  reader.onerror = () => reject(new Error('Failed to read file'));
  reader.readAsDataURL(file);
});
...
const uploadRes = await apiRequest("POST", "/api/objects/upload", { data: base64, mimeType: file.type });
```

It reads the **full-resolution** file and sends it as base64 text. Two things combine to break this:

1. The server caps request bodies at **5MB** — `app.use(express.json({ limit: '5mb' }))` in `server/index.ts:236` (and the matching `urlencoded` on line 237).
2. Base64 encoding **inflates the size by ~33%**.

So any photo larger than roughly **3.7MB on disk** produces a request bigger than 5MB. Express rejects it with a **413 Payload Too Large** *before the upload route ever runs*. Modern phone photos are commonly 4–12MB, so normal photos fail every time. The handler's `catch {}` swallows the real status and shows a generic error, which is why it looks like it "just stopped working".

There is currently **no client-side resizing** — a profile thumbnail never needs to be more than a few hundred KB, so we should shrink it in the browser before uploading.

## The fix

Three changes, all in `client/src/pages/StaffManagement.tsx`, plus one tiny safety bump server-side.

### 1. Resize/compress the photo in the browser before uploading (the real fix)

Add a small helper that draws the chosen image onto a canvas, scaled down to a sensible max dimension, and re-encodes it as a compressed JPEG. A 512px JPEG at ~0.82 quality is plenty for a profile photo and will be tens of KB, not megabytes.

Add this helper near the other helpers in the component file:

```ts
// Downscale + compress an image file to a small JPEG data URL (base64 only, no prefix).
// Profile photos never need to be full-resolution; this keeps uploads well under the
// server body limit and makes them fast and reliable regardless of source size.
const compressImageToBase64 = (file: File, maxDim = 512, quality = 0.82): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        // Always output JPEG so even PNG/HEIC screenshots come out small.
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl.split(',')[1]); // strip the "data:image/jpeg;base64," prefix
      };
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};
```

Then rewrite `handleStaffPhotoUpload` to use it, fix the error handling so the real failure is reported, and fix the spinner (see point 2):

```ts
const handleStaffPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file || !viewingStaff) return;

  setIsUploadingStaffPhoto(true);
  try {
    // Shrink before upload — output is always a small JPEG, well under the body limit.
    const base64 = await compressImageToBase64(file);
    const uploadRes = await apiRequest("POST", "/api/objects/upload", { data: base64, mimeType: "image/jpeg" });
    const { objectPath } = await uploadRes.json();
    await updateStaffPhotoMutation.mutateAsync({ staffId: viewingStaff.id, photoUrl: objectPath });
  } catch (err: any) {
    const msg = err?.status === 413
      ? "That image is too large. Please try a smaller photo."
      : "Failed to upload photo. Please try again.";
    toast({ title: "Error", description: msg, variant: "destructive" });
  } finally {
    setIsUploadingStaffPhoto(false);
    e.target.value = "";
  }
};
```

Note: send `mimeType: "image/jpeg"` because the compressed output is always JPEG, regardless of the original format. This also neatly handles HEIC iPhone photos, which would otherwise upload as a format browsers can't display.

### 2. Fix the spinner stopping too early (small UX bug, fixed by the rewrite above)

In the current code, `setIsUploadingStaffPhoto(false)` runs in a `finally` block while the save (`updateStaffPhotoMutation.mutate(...)`) is fire-and-forget — so the spinner stops before the photo is actually saved. The rewrite above uses `await ...mutateAsync(...)` so the spinner stays up until the save genuinely completes. `mutateAsync` is the awaitable version of the existing mutation — no other change to `updateStaffPhotoMutation` is needed.

### 3. Belt-and-braces: raise the server body limit slightly

Even though resizing makes huge bodies impossible from this screen, raise the limit a little so other base64 upload paths (logos, documents) are also more forgiving. In `server/index.ts:236-237`:

```ts
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: false, limit: '15mb' }));
```

This is optional but cheap and reduces the chance of the same silent 413 biting other upload screens.

## Bonus fix (separate, but you're already in this file) — broken photo on the downloadable QR ID card

In the QR-pass card generator, `resolveUrl` (around line 490) builds the photo URL like this:

```ts
const resolveUrl = (path: string | null | undefined) => path
  ? (path.startsWith('http') ? path : `${window.location.origin}/objects${path.startsWith('/') ? '' : '/'}${path}`)
  : null;
```

But `photoUrl` is already stored as `/objects/<customerId>/uploads/<id>`, so this produces a **doubled** path: `…/objects/objects/<customerId>/uploads/<id>`, which 404s — meaning the staff photo is blank on the downloaded ID card. Fix by not re-prefixing a path that's already an `/objects/...` path:

```ts
const resolveUrl = (path: string | null | undefined) => {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('/objects/')) return path;
  return `${window.location.origin}/objects${path.startsWith('/') ? '' : '/'}${path}`;
};
```

This is a real but separate bug; do it only if convenient, otherwise raise it as its own ticket.

## Scope guard

- Main fix is **client-side only** in `client/src/pages/StaffManagement.tsx` (the resize helper + the rewritten `handleStaffPhotoUpload`).
- The only server change is the optional body-limit bump in `server/index.ts` — do **not** touch the `/api/objects/upload` route logic or the `/objects/:objectPath` serving route.
- Don't change the storage path format, auth, or the staff schema.
- Run `npm run check` when done.

## Verify

1. Open a staff profile → click the camera → choose a **large** photo straight off a phone (5MB+) → it uploads, the spinner stays up until done, and the new photo appears on the profile.
2. Choose a tiny image → still works.
3. (If you didn't fix it) confirm whether the photo shows on the downloaded QR ID card; with the bonus fix it should now appear instead of being blank.
4. Re-open the profile later (fresh page load) → the saved photo still loads.
