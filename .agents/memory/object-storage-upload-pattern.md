---
name: Object storage upload pattern
description: Correct GCS file-upload pattern using objectStorageClient; ObjectStorageService has no uploadObject() method
---

## Rule
`ObjectStorageService` does **not** have an `uploadObject()` method. Calling it throws `TypeError: objectStorage.uploadObject is not a function`.

**Why:** The service uses a signed-URL pattern (`getObjectEntityUploadURL`) for client-side uploads and exposes `getPrivateObjectDir()` + raw GCS client for server-side uploads.

**How to apply:** For server-side multer buffer → object storage uploads, use this pattern (from `server/routes/permitToWork.ts`):

```typescript
import { ObjectStorageService, objectStorageClient } from '../objectStorage';
import { randomUUID } from 'crypto';

const objectStorage = new ObjectStorageService();

// Inside route handler, after multer has populated req.file:
const privateDir = objectStorage.getPrivateObjectDir();
const objectId = randomUUID();
const fullPath = `${privateDir}/uploads/${objectId}`;
const parts = fullPath.slice(1).split('/');
const bucketName = parts[0];
const objectName = parts.slice(1).join('/');
const bucket = objectStorageClient.bucket(bucketName);
const fileObj = bucket.file(objectName);
await fileObj.save(req.file.buffer, { contentType: req.file.mimetype, resumable: false });
const fileUrl = `/objects/uploads/${objectId}`;
```

The resulting `fileUrl` is a normalized internal path like `/objects/uploads/<uuid>` which the download endpoint resolves back to GCS.
