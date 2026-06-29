---
name: Nix chromium path for Puppeteer in production
description: Production Replit container has chromium in /nix/store but NOT in PATH; use known content-addressed hash path and set PUPPETEER_EXECUTABLE_PATH at startup.
---

# Nix chromium path for Puppeteer in production

## The rule

Always use the known nix store path directly — never rely solely on `which chromium` in PATH.

In production, set `PUPPETEER_EXECUTABLE_PATH` at server startup so every Puppeteer caller benefits automatically.

Known candidates (add new entries when channel is bumped):
```
/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium
```

**Why:** Replit's deployment container mounts the nix store but does NOT add nix bin directories to PATH. `which chromium` fails → Puppeteer falls back to its managed Chrome cache → `libglib-2.0.so.0: cannot open shared object file: No such file or directory` (Code 127). Verified from production DB — every enterprise PDF generation failed with this exact error.

**How to apply:**
- `server/index.ts` `ensureChromeBinary()` runs at startup, checks the list, sets `process.env.PUPPETEER_EXECUTABLE_PATH` if found
- `server/enterpriseReportService.ts` `findChromiumExecutable()` mirrors the same list as belt-and-suspenders
- Nix hashes are content-addressed: same `pkgs.chromium` version + `stable-24_05` channel = same hash in dev and production
- Do NOT scan `/nix/store` with `readdirSync` — it has thousands of entries and hangs
- Do NOT use `ls /nix/store/*chromium*/bin/chromium` glob — also hangs (>8s timeout)
- `replit.nix` must list `pkgs.chromium` so the binary is included in the production build

## Update procedure

When chromium is upgraded (e.g., Replit bumps the nix channel):
1. Run `realpath $(command -v chromium)` in dev to get the new hash path
2. Add it to `NIX_CHROMIUM_CANDIDATES` in both `server/index.ts` and `server/enterpriseReportService.ts`
3. Keep old entries as fallbacks (they'll simply fail the `existsSync` check)
