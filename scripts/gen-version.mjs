import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const d = new Date();
const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;

let suffix = "";
try {
  suffix = "-" + execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {
  suffix = "." + `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}

const version = `v${date}${suffix}`;

const outPath = resolve(__dirname, "../shared/version.ts");
writeFileSync(
  outPath,
  `// AUTO-GENERATED — do not edit by hand. Regenerated on every server start and build.\nexport const APP_VERSION = ${JSON.stringify(version)};\n`
);

console.log(`[version] stamped ${version}`);
