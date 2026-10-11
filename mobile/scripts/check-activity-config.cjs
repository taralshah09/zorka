// Inspect native config without printing environment values or generating android/.
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const path = require("node:path");
const result = spawnSync(
  process.execPath,
  [require.resolve("expo/bin/cli"), "config", "--type", "introspect", "--json"],
  {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  },
);
if (result.status !== 0)
  throw new Error("Expo config introspection failed. Run expo config --type introspect to diagnose locally.");
const config = JSON.parse(result.stdout);
assert.ok(config.plugins.some((p) => (Array.isArray(p) ? p[0] : p) === "@maplibre/maplibre-react-native"));
const android = config._internal.modResults.android;
assert.equal(
  android.gradleProperties.find((p) => p.type === "property" && p.key === "android.minSdkVersion")?.value,
  "26",
  "Health Connect requires generated Android minSdkVersion 26",
);
const manifest = android.manifest.manifest;
const permissions = manifest["uses-permission"].map((p) => p.$["android:name"]);
for (const p of [
  "android.permission.health.READ_STEPS",
  "android.permission.ACCESS_BACKGROUND_LOCATION",
  "android.permission.FOREGROUND_SERVICE_LOCATION",
  "android.permission.POST_NOTIFICATIONS",
])
  assert.ok(permissions.includes(p), p);
assert.ok(!permissions.some((p) => p.startsWith("android.permission.health.WRITE_")));
const app = manifest.application[0];
assert.ok(app.activity.some((a) => a.$["android:name"] === ".HealthPrivacyActivity"));
assert.equal(
  app["activity-alias"].find((a) => a.$["android:name"] === "ViewPermissionUsageActivity").$["android:targetActivity"],
  ".HealthPrivacyActivity",
);
assert.ok(
  app["meta-data"].some(
    (m) =>
      m.$["android:name"] === "expo.modules.location.foreground_service_icon" &&
      m.$["android:resource"] === "@drawable/kimbo_recording",
  ),
);
console.log(
  "Activity native config: Android minimum SDK 26, MapLibre plugin, step-only health access, GPS foreground service, background location, notifications and privacy rationale verified.",
);
