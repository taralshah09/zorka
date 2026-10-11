// CNG: a dedicated, offline privacy page for Health Connect's rationale intents.
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

module.exports = function withHealthRationale(config) {
  config = withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(c.modResults);
    const action = "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE";
    main["intent-filter"] = (main["intent-filter"] ?? []).filter(
      (f) => !(f.action ?? []).some((a) => a.$["android:name"] === action),
    );
    app.activity = (app.activity ?? []).filter((a) => a.$["android:name"] !== ".HealthPrivacyActivity");
    app.activity.push({
      $: { "android:name": ".HealthPrivacyActivity", "android:exported": "true" },
      "intent-filter": [{ action: [{ $: { "android:name": action } }] }],
    });
    const alias = (app["activity-alias"] ?? []).find((a) => a.$["android:name"] === "ViewPermissionUsageActivity");
    if (alias) alias.$["android:targetActivity"] = ".HealthPrivacyActivity";
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      app,
      "expo.modules.location.foreground_service_icon",
      "@drawable/kimbo_recording",
      "resource",
    );
    return c;
  });
  return withDangerousMod(config, [
    "android",
    async (c) => {
      const packageName = c.android.package;
      const dir = path.join(c.modRequest.platformProjectRoot, "app/src/main/java", ...packageName.split("."));
      fs.mkdirSync(dir, { recursive: true });
      const drawable = path.join(c.modRequest.platformProjectRoot, "app/src/main/res/drawable");
      fs.mkdirSync(drawable, { recursive: true });
      fs.writeFileSync(
        path.join(drawable, "kimbo_recording.xml"),
        `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:strokeColor="#FFFFFFFF" android:strokeWidth="2" android:fillColor="#00000000" android:pathData="M12,3 A9,9 0,1 0,12 21 A9,9 0,1 0,12 3 M7,15 L10,9 L14,15 L17,9" android:strokeLineCap="round" android:strokeLineJoin="round" /></vector>`,
      );
      fs.writeFileSync(
        path.join(dir, "HealthPrivacyActivity.kt"),
        `package ${packageName}
import android.app.Activity
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView

class HealthPrivacyActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val text = TextView(this)
    text.text = "Kimbo · Health Connect privacy\\n\\nKimbo reads only Steps to show your daily progress, hourly totals and seven-day history. It never writes health data. Step totals are cached on this phone and are not sent to Kimbo's server.\\n\\nAll demo profiles on this phone see the same Health Connect steps. GPS activities are stored separately per selected profile.\\n\\nAccess is optional. You can revoke it in Health Connect settings at any time. Previously cached totals stay on your phone until Kimbo's app data is cleared."
    text.textSize = 18f
    val padding = (24 * resources.displayMetrics.density).toInt()
    text.setPadding(padding, padding, padding, padding)
    val scroll = ScrollView(this)
    scroll.addView(text)
    setContentView(scroll)
  }
}
`,
      );
      return c;
    },
  ]);
};
