# Replit Prompt — Add image upload to the blog post cover image field

## What this is

On the Platform Admin dashboard, the "New Blog Post" / "Edit Blog Post" dialog only lets the user **paste a URL** into the "Cover Image URL" field. There's no way to upload an image from your computer. Add a file upload option, while keeping the paste-a-URL option as well.

**Good news:** this same page already has a fully working image upload for the branding logo. Reuse that exact pattern — don't invent anything new.

## Files involved

- **Client:** `client/src/pages/PlatformAdminDashboard.tsx`
  - Blog form state: `blogForm` (includes `coverImageUrl`), around line 95 and 572.
  - Existing logo upload pattern to copy: `updateBrandingMutation`, lines ~288–319 (gets CSRF token, builds `FormData`, POSTs to an upload endpoint, uses the returned path).
  - Cover Image field to change: lines ~1477–1485.
  - Blog save mutations: `createBlogMutation` (~595) and `updateBlogPostMutation` (~615) — both send `coverImageUrl`.
- **Server:** `server/routes/platformAdmin.ts`
  - Existing logo upload endpoint to copy: `app.post("/platform-admin/branding/upload-logo", ...)`, lines ~714–778 (multer memory storage → Google Cloud object storage `public/` dir → returns filename).
  - Multer setup: lines ~18–40 (`logoUpload` wrapper).
- **Display (no change needed if endpoint returns the right path):** `client/src/pages/BlogPostPage.tsx` (line ~86) and `client/src/pages/BlogListPage.tsx` (line ~88) render `<img src={post.coverImageUrl} />` directly.

## Important detail — how the path is stored

The logo upload returns **just the filename** and the page adds the `/public-objects/` prefix when displaying it (see `PlatformAdminDashboard.tsx:687`). But the blog pages render `coverImageUrl` **directly** with no prefix.

So the new blog upload endpoint must return the **full display path** — i.e. `/public-objects/<filename>` — and that full path gets saved into `coverImageUrl`. That way the existing blog display code works unchanged, and pasted full URLs (e.g. `https://...`) still work too.

## What to build

### 1. Server — new upload endpoint

In `server/routes/platformAdmin.ts`, add an endpoint that mirrors the existing `upload-logo` one:

```ts
// Reuse the same multer wrapper pattern as logoUpload, but for field name "image"
const blogImageUpload = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'File upload failed.' });
    }
    next();
  });
};

app.post("/platform-admin/blog/upload-image", requirePlatformAdmin, blogImageUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file uploaded' });
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ success: false, error: 'Invalid file type. Only JPEG, PNG, GIF and WebP images are allowed.' });
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (req.file.size > maxSize) {
      return res.status(400).json({ success: false, error: 'File too large. Maximum size is 5MB.' });
    }

    const path = await import('path');
    const { objectStorageClient } = await import('../objectStorage');

    const ext = path.default.extname(req.file.originalname).toLowerCase();
    const fileName = `blog-cover-${Date.now()}${ext}`;
    const bucketName = 'replit-objstore-9ec67884-ec26-4167-84d1-c8ceecee21b7';
    const objectName = `public/${fileName}`;

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    await file.save(req.file.buffer, { metadata: { contentType: req.file.mimetype } });

    // Return the FULL display path so it can be stored directly in coverImageUrl
    res.json({ success: true, coverImageUrl: `/public-objects/${fileName}` });
  } catch (error) {
    logger.error('Error uploading blog cover image:', error);
    res.status(500).json({ success: false, error: 'Failed to upload image' });
  }
});
```

Match the surrounding code's existing imports, logger, `requirePlatformAdmin`, multer `upload` instance and bucket name — don't hard-code anything that already exists as a constant in the file.

### 2. Client — add upload UI to the blog dialog

In `client/src/pages/PlatformAdminDashboard.tsx`, in the Cover Image section (~line 1477):

- Keep the existing URL `Input`.
- Keep an **"Upload image"** button + hidden `<input type="file" accept="image/*">`, styled the same as the existing logo upload control on this page.
- **Wrap the cover image section in a drop zone** — a bordered box (dashed border) that accepts a dragged-in image file. On drag-over, highlight the box (e.g. change the border colour / background) so it's obvious it's a valid target; reset the style on drag-leave and drop.
- **Support clipboard paste** — when the drop zone is focused/hovered, a paste (Ctrl/Cmd+V) of an image grabs the image off the clipboard and uploads it. This is handy straight after taking a screenshot. The bug-reporting feature in this codebase already does clipboard image paste — follow that same approach for reading the image out of the paste/drop event.
- All three inputs (button, drag-drop, paste) funnel into **one shared upload function** so there's no duplicated logic. That function: get the CSRF token (`/api/csrf-token`), build a `FormData` with field name `image`, POST to `/platform-admin/blog/upload-image` with the `X-CSRF-Token` header and `credentials: 'include'` — exactly like `updateBrandingMutation` does for the logo.
- Before uploading, validate client-side that the dropped/pasted item is actually an image file and under 5MB; show a clear `toast` if not (a drop event can contain non-image data).
- On success, set `blogForm.coverImageUrl` to the returned `coverImageUrl` and show a small thumbnail preview plus a "Remove" link.
- Show a loading state in the drop zone while uploading, and a `toast` on error using the existing `toast` pattern.
- Remember to `preventDefault()` / `stopPropagation()` on the `onDragOver` and `onDrop` handlers, otherwise the browser just opens the dropped image in a new tab.

Help text inside the drop zone: `Drag an image here, paste from your clipboard, click to upload, or paste a link below (JPEG, PNG, GIF or WebP, max 5MB).`

No change is needed to `createBlogMutation` / `updateBlogPostMutation` — they already send `coverImageUrl`, which now holds the uploaded path.

### 3. Display — verify only

`BlogPostPage.tsx` and `BlogListPage.tsx` render `coverImageUrl` directly, so uploaded `/public-objects/...` paths will work with no change. Confirm a pasted full `https://` URL still displays too (it will, since both are valid `src` values).

## Acceptance checklist

- [ ] In New/Edit Blog Post, I can add a cover image four ways: paste a URL, click to upload, **drag an image onto the cover area**, or **paste an image from the clipboard**.
- [ ] Dragging an image over the drop zone highlights it; dropping it uploads it (and does NOT open the image in a new browser tab).
- [ ] Pasting a screenshot from the clipboard uploads it the same way.
- [ ] Uploading shows a loading state, then a thumbnail preview with a Remove option.
- [ ] Non-image files and files over 5MB are rejected with a clear message.
- [ ] After saving the post, the cover image shows correctly on both the blog listing page and the individual blog post page.
- [ ] A previously pasted URL still works exactly as before.
- [ ] Only platform admins can hit the upload endpoint (`requirePlatformAdmin`).

## Notes

- No database migration needed — `coverImageUrl` already exists in `shared/schema.ts`.
- Images go in the object storage `public/` directory, same as the logo, so they're publicly viewable on the live blog (correct for a public marketing blog).
