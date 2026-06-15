# FEATURE — One app version, stamped automatically on every deploy

**Source:** BR-009 (15 Jun 2026) shows bug-report "App Version: dev"; the Settings "Application Version" badge shows `v2026.02.26` (stale — it's June). Andy: *"Version number needs to change every time we deploy a new updated version."*

> This supersedes the narrower `bugfix-bug-report-app-version-blank-june2026.md` — it fixes the same bug-report field **and** the Settings badge from one shared source. Do this one instead.

## The problem
The version is **hardcoded in several different places and updated by hand** (so it's stuck in February):
- `server/routes/settings.ts` ~line 273 → `version: "v2026.02.26"` — the `/api/system/status` value behind the **Settings → Application Version badge**.
- `server/routes/reports.ts` ~line 981 → another hardcoded `"v2026.02.26"`.
- `server/index.ts` ~lines 514/516 → `buildVersion: 'v2026.02.22.2'` in the startup build log.
- `client/src/components/ReportProblemButton.tsx` ~line 182 → reads `import.meta.env.VITE_APP_VERSION`, which isn't set at build time, so bug reports show `'dev'`.
- `server/utils/logger.ts` ~line 48 → already reads `process.env.APP_VERSION || '1.0.0'` (also never set).

Four sources, three values, none auto-updating. The fix is **one source of truth, generated at build time, read everywhere.**

## The fix — a generated version file, regenerated on every build

### 1. Build-time generator script
Add `scripts/gen-version.mjs` that computes a version and writes a small file both client and server import. Derive it from the **build date + short git SHA** so it changes on every deploy (and is unique even for two deploys on the same day):
```js
// scripts/gen-version.mjs
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const d = new Date();
const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
let sha = "";
try { sha = "-" + execSync("git rev-parse --short HEAD").toString().trim(); }
catch { sha = "." + `${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}`; } // fallback if no git: add HHMM

const version = `v${date}${sha}`; // e.g. v2026.06.15-a1b2c3d  (or v2026.06.15.1410 with no git)
writeFileSync(
  new URL("../shared/version.ts", import.meta.url),
  `// AUTO-GENERATED on build — do not edit by hand.\nexport const APP_VERSION = ${JSON.stringify(version)};\n`
);
console.log("[version] stamped", version);
```

### 2. Run it on every build
In `package.json`, npm runs a `prebuild` script automatically before `build`:
```json
"prebuild": "node scripts/gen-version.mjs",
"build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
```
On Replit, deploying runs the build, so the version regenerates every deploy. (Optionally also run it before `dev` so local dev shows a sensible value.)

### 3. Commit a safe default + ignore the generated file
- Commit a default `shared/version.ts` (e.g. `export const APP_VERSION = "dev";`) so the app builds even before the script runs.
- Add `shared/version.ts` to `.gitignore` so the generated value doesn't cause noisy diffs (keep the default as `shared/version.ts.default` or similar if you prefer — whatever keeps the build green).

### 4. Read it everywhere (single source of truth)
- **`server/routes/settings.ts`** (`/api/system/status`): replace the hardcoded `version: "v2026.02.26"` with `version: APP_VERSION` (import from `../../shared/version`).
- **`server/routes/reports.ts`** ~981: same — use `APP_VERSION`, not the hardcoded string.
- **`server/index.ts`** ~514/516: use `APP_VERSION` in the build log line; and set `process.env.APP_VERSION = APP_VERSION` early at startup so `logger.ts` picks it up too.
- **`client/src/components/ReportProblemButton.tsx`** ~182: import `APP_VERSION` from `shared/version` and send that, e.g. `appVersion: APP_VERSION`. (Vite bundles the literal — no env-var plumbing needed. Drop the `import.meta.env.VITE_APP_VERSION ?? 'dev'` line.)

## Acceptance criteria
- After a deploy, the **Settings → Application Version** badge shows the new version (today's date + sha), not `v2026.02.26`.
- A new **bug report / PDF** shows the same version string, never `dev` (in production).
- The startup build log and the logger's `version` field show the same value.
- Deploying again produces a **different** version string (different sha, or different date/time) — proving it changes per deploy.
- All four old hardcoded version strings are gone; there is exactly one source (`shared/version.ts`).

## Notes
- No database schema change — `bug_reports.app_version` already exists.
- Keep the `vYYYY.MM.DD` style Andy already uses; the trailing sha/time just guarantees uniqueness per deploy.
