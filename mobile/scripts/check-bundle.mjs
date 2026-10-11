// P42 · Bundle-size budget (D69). Exports the Android Hermes bundle into a temp folder and fails when it's over budget.
// Run: npm run bundle:check                     (JS bundle + assets)
//      npm run bundle:check -- --apk <file.apk>  (also checks a built APK, e.g. the one EAS hands you)
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const BUDGET = {
  /** Hermes bytecode for Android (was 4.4 MB at P37). */
  jsBytes: 5 * 1024 * 1024,
  /** Fonts, images and other bundled assets. */
  assetBytes: 3 * 1024 * 1024,
  /** Release APK for one ABI or universal with MapLibre (the biggest native piece). */
  apkBytes: 60 * 1024 * 1024,
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const out = mkdtempSync(join(tmpdir(), "zorka-bundle-"));
let failed = false;
try {
  const res = spawnSync("npx", ["expo", "export", "--platform", "android", "--output-dir", out], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (res.status !== 0) {
    console.error("expo export failed");
    process.exit(res.status ?? 1);
  }

  const files = walk(out).map((f) => ({ path: relative(out, f), bytes: statSync(f).size }));
  const js = files.filter((f) => /\.(hbc|js)$/.test(f.path) && f.path.includes("_expo"));
  const assets = files.filter((f) => f.path.startsWith("assets"));
  const jsBytes = js.reduce((s, f) => s + f.bytes, 0);
  const assetBytes = assets.reduce((s, f) => s + f.bytes, 0);

  const row = (label, bytes, budget) => {
    const ok = bytes <= budget;
    if (!ok) failed = true;
    console.log(`${ok ? "ok  " : "OVER"}  ${label.padEnd(10)} ${mb(bytes).padStart(10)}  / budget ${mb(budget)}`);
  };
  console.log("\nAndroid bundle size");
  row("JS (Hermes)", jsBytes, BUDGET.jsBytes);
  row("Assets", assetBytes, BUDGET.assetBytes);

  console.log("\nLargest assets:");
  for (const f of [...assets].sort((a, b) => b.bytes - a.bytes).slice(0, 5))
    console.log(`  ${mb(f.bytes).padStart(9)}  ${f.path}`);

  const apkFlag = process.argv.indexOf("--apk");
  if (apkFlag !== -1 && process.argv[apkFlag + 1]) {
    row("APK", statSync(process.argv[apkFlag + 1]).size, BUDGET.apkBytes);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (failed) {
  console.error("\nOver budget. Look for a new dependency or a large asset before raising the budget (D69).");
  process.exit(1);
}
console.log("\nWithin budget.");
