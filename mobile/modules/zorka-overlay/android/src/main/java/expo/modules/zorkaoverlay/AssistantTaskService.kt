// Runs one bubble request as the "ZorkaAssistant" headless JS task (src/features/assistant/overlayTask.ts): a turn
// (a recording or typed words) or a tap on the card (OK, Undo, an option). Starts React if Zorka isn't running. The
// task answers by calling ZorkaOverlay.render, which reaches OverlayService.
package expo.modules.zorkaoverlay

import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class AssistantTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    // Speech-to-text, the router and the parsers can take a while on free-tier AI; the server gives up first.
    return HeadlessJsTaskConfig(TASK, Arguments.fromBundle(extras), TIMEOUT_MS, true)
  }

  companion object {
    const val TASK = "ZorkaAssistant"
    private const val TIMEOUT_MS = 90_000L

    fun turnFromAudio(c: Context, path: String) =
      c.startService(Intent(c, AssistantTaskService::class.java).putExtra("op", "turn").putExtra("audioPath", path))

    fun turnFromText(c: Context, text: String) =
      c.startService(Intent(c, AssistantTaskService::class.java).putExtra("op", "turn").putExtra("text", text))

    fun action(c: Context, messageId: String, index: Int, action: String) =
      c.startService(
        Intent(c, AssistantTaskService::class.java)
          .putExtra("op", "action")
          .putExtra("messageId", messageId)
          .putExtra("index", index)
          .putExtra("action", action),
      )
  }
}
