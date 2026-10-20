// The JS side of the Zorka bubble (modules/zorka-overlay/index.ts). Permissions, start/stop, the remembered on/off
// switch, the card's content from the headless task, and opening Zorka at a deep link.
package expo.modules.zorkaoverlay

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ZorkaOverlayModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ZorkaOverlay")

    Function("canDrawOverlays") { Settings.canDrawOverlays(context) }

    Function("openOverlaySettings") {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("start") { OverlayService.start(context) }

    Function("stop") { OverlayService.stop(context) }

    Function("isRunning") { OverlayService.running }

    Function("setEnabled") { enabled: Boolean -> OverlayPrefs.setEnabled(context, enabled) }

    Function("isEnabled") { OverlayPrefs.isEnabled(context) }

    Function("render") { json: String -> OverlayService.render(json) }

    Function("openUrl") { url: String -> Launch.openUrl(context, url) }
  }
}
