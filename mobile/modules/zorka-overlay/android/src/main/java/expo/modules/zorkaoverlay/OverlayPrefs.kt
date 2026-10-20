// What the bubble remembers across restarts: whether the user turned it on, and where they left it on the screen.
package expo.modules.zorkaoverlay

import android.content.Context
import android.content.Intent
import android.net.Uri

internal object OverlayPrefs {
  private const val FILE = "zorka_overlay"
  private const val ENABLED = "enabled"
  private const val X = "x"
  private const val Y = "y"

  private fun prefs(c: Context) = c.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  fun isEnabled(c: Context) = prefs(c).getBoolean(ENABLED, false)

  fun setEnabled(c: Context, enabled: Boolean) = prefs(c).edit().putBoolean(ENABLED, enabled).apply()

  /** The bubble's last position, or null before the first drag. */
  fun position(c: Context): Pair<Int, Int>? {
    val p = prefs(c)
    return if (p.contains(X) && p.contains(Y)) p.getInt(X, 0) to p.getInt(Y, 0) else null
  }

  fun savePosition(c: Context, x: Int, y: Int) = prefs(c).edit().putInt(X, x).putInt(Y, y).apply()
}

internal object Launch {
  /** Opens Zorka at a deep link ("zorka://activity/record?kind=walk"). Allowed from the background while the bubble
   *  is showing: an app with "Display over other apps" may start its own activities. */
  fun openUrl(c: Context, url: String) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      .setPackage(c.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    c.startActivity(intent)
  }
}
