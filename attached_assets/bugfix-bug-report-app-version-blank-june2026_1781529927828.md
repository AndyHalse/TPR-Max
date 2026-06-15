> ⚠️ **SUPERSEDED — do not use.** Replaced by `feature-app-version-auto-stamp-june2026.md`, which fixes this bug-report field *and* the stale Settings "Application Version" badge from one shared, auto-stamped source. Use that prompt instead.

# BUGFIX — Bug reports / PDF show a blank App Version

**Source:** Observed in the BR-008 PDF export (15 Jun 2026) — the "App Version" field is present but empty.

## The problem
`client/src/components/ReportProblemButton.tsx` (line ~182) sends:
```ts
appVersion: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev',
```
This comes through blank, which means `VITE_APP_VERSION` is **defined but empty** at build time. The nullish-coalescing `??` only falls back to `'dev'` when the value is `null`/`undefined` — an empty string `""` passes straight through. So nothing actually populates the version, and the whole point of the version stamp (knowing which build a bug came from, so you don't waste time debugging a stale cached bundle) is lost.

## The fix
**1. Actually define the version at build time.** In `vite.config.ts`, inject a real version so `import.meta.env.VITE_APP_VERSION` is populated. Use the `package.json` version and, ideally, the short git commit SHA:
```ts
// vite.config.ts
import pkg from "./package.json"; // or read version another way
import { execSync } from "node:child_process";

const gitSha = (() => {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); }
  catch { return "nogit"; }
})();

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(`${pkg.version}+${gitSha}`),
  },
  // ...existing config
});
```
(If the build runs somewhere git isn't available, the `catch` keeps it safe. On Replit, a build-time env var like `REPL_SLUG`/deployment id is a fine substitute.)

**2. Make the client fallback catch empty strings too.** In `ReportProblemButton.tsx`, change `??` to `||` so a blank value still falls back:
```ts
appVersion: (import.meta.env.VITE_APP_VERSION as string | undefined) || 'dev',
```

## Acceptance criteria
- A new bug report stores a non-empty `appVersion` (e.g. `1.4.2+a1b2c3d`, or at worst `dev` — never blank).
- The value appears in the admin detail view and in the downloaded PDF.
- The version changes between deployments so two reports from different builds are distinguishable.

## Note
No schema change — the `app_version` column already exists on `bug_reports`.
