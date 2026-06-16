# Replit Prompt — Fix "Validation failed" when saving a blog post with an uploaded cover image

## The bug

After adding the cover-image upload feature, creating or updating a blog post fails with **"Validation failed"** whenever a cover image has been uploaded (rather than a full URL pasted in).

**Cause:** the server-side validation for `coverImageUrl` requires a fully-qualified URL (`z.string().url()`), but the upload feature stores a **site-relative path** like `/public-objects/blog-cover-1781605753262.png`. A relative path is not a valid URL, so Zod rejects it and the whole request fails validation.

The image upload itself works fine — this is purely the save step rejecting the path.

## File

`server/routes/platformAdmin.ts` — the `blogPostSchema` Zod object, around **line 1243–1253**. The offending line is:

```ts
coverImageUrl: z.string().url().optional().nullable(),
```

## The fix

Change `coverImageUrl` to accept **either** a full `http(s)` URL **or** a site-relative path beginning with `/`. Replace that single line with:

```ts
coverImageUrl: z
  .string()
  .refine(
    (v) => /^https?:\/\//i.test(v) || v.startsWith('/'),
    'Cover image must be a full URL (https://...) or an uploaded image path (/public-objects/...)'
  )
  .optional()
  .nullable(),
```

Leave the rest of `blogPostSchema` exactly as it is. Both the create route (`POST /api/admin/blog`) and update route (`PATCH /api/admin/blog/:id`) use this same schema (the PATCH uses `.partial()`), so this one change fixes both.

## Why not just drop `.url()` entirely

Dropping validation would let any junk string through. Accepting "a real URL or a leading-slash path" keeps the guard meaningful while allowing the uploaded paths the new feature produces. Pasted `https://...` links keep working unchanged.

## Acceptance checklist

- [ ] Upload a cover image, fill the post in, click **Create Post** → it saves with no "Validation failed" error.
- [ ] The cover image displays correctly on the blog listing and individual post pages.
- [ ] Pasting a full `https://...` image URL still saves correctly (regression check).
- [ ] Editing an existing post and changing its cover image still saves (PATCH route uses the same schema).
- [ ] Saving with no cover image at all still works (field is optional/nullable).
