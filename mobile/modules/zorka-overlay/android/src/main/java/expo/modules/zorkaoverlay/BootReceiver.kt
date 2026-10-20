// Brings the bubble back after a reboot or an app update, when the user had it on and Android still allows it.
package expo.modules.zorkaoverlay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Settings

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    if (OverlayPrefs.isEnabled(context) && Settings.canDrawOverlays(context)) OverlayService.start(context)
  }
}
