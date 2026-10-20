// The bubble's card, drawn over whatever app is open (docs/ASSISTANT_BAR_PLAN.md "Result sheet"): "Listening…",
// "Working on it…", a text field to type, or a turn's result from the headless task (src/features/assistant/
// overlayView.ts): "Heard: …", Zorka's reply, one row per action with its buttons (OK / Change / Not now, option chips,
// Undo). A card that doesn't wait on the user hides itself after the Undo window (10 s). Brand colours, both themes.
package expo.modules.zorkaoverlay

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject

internal class OverlayCard(private val context: Context, private val wm: WindowManager, private val events: Events) {
  interface Events {
    fun onAction(messageId: String, index: Int, action: String)
    fun onSend(text: String)
    fun onOpen(url: String)
  }

  private val handler = Handler(Looper.getMainLooper())
  private val hideLater = Runnable { hide() }
  private var root: LinearLayout? = null
  private var params: WindowManager.LayoutParams? = null

  private fun dp(v: Int) = (v * context.resources.displayMetrics.density).toInt()

  private fun rounded(color: Int, radiusDp: Int, stroke: Int? = null) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = dp(radiusDp).toFloat()
    if (stroke != null) setStroke(dp(1), stroke)
  }

  private fun text(value: String, sizeSp: Float, color: Int, bold: Boolean = false) = TextView(context).apply {
    text = value
    setTextColor(color)
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
    if (bold) typeface = Typeface.DEFAULT_BOLD
  }

  private fun button(label: String, primary: Boolean, onClick: () -> Unit) = TextView(context).apply {
    text = label
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
    typeface = Typeface.DEFAULT_BOLD
    setTextColor(if (primary) INK else CREAM)
    background = if (primary) rounded(LIME, 20) else rounded(Color.TRANSPARENT, 20, OUTLINE)
    setPadding(dp(16), dp(10), dp(16), dp(10))
    minHeight = dp(44)
    gravity = Gravity.CENTER
    isClickable = true
    contentDescription = label
    setOnClickListener {
      it.isEnabled = false
      onClick()
    }
  }

  /** Shows a card with `body`. `focusable` lets a text field take the keyboard; the card then sits at the top. */
  private fun show(focusable: Boolean, autoHideMs: Long?, body: (LinearLayout) -> Unit) {
    handler.removeCallbacks(hideLater)
    val content = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(16), dp(14), dp(16), dp(14))
    }
    body(content)
    val card = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      background = rounded(INK, 24, OUTLINE)
      elevation = dp(8).toFloat()
      addView(
        ScrollView(context).apply { addView(content); isVerticalScrollBarEnabled = false },
        LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT),
      )
    }
    val width = context.resources.displayMetrics.widthPixels - dp(24)
    val maxHeight = (context.resources.displayMetrics.heightPixels * 0.6).toInt()
    content.measure(
      View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
    )
    val height = minOf(content.measuredHeight, maxHeight)
    val p = WindowManager.LayoutParams(
      width,
      height,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      (if (focusable) 0 else WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE) or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = (if (focusable) Gravity.TOP else Gravity.BOTTOM) or Gravity.CENTER_HORIZONTAL
      y = dp(if (focusable) 72 else 32)
      softInputMode = WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE
    }
    val old = root
    if (old != null) wm.removeView(old)
    wm.addView(card, p)
    root = card
    params = p
    if (autoHideMs != null) handler.postDelayed(hideLater, autoHideMs)
  }

  private fun header(content: LinearLayout, title: String, openUrl: String?) {
    val row = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    row.addView(text(title, 15f, LIME, bold = true), LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    if (openUrl != null) row.addView(button("Open Zorka", false) { hide(); events.onOpen(openUrl) })
    row.addView(button("✕", false) { hide() }.apply { contentDescription = "Close" })
    content.addView(row)
  }

  private fun gap(content: LinearLayout, dpH: Int) = content.addView(View(context), LinearLayout.LayoutParams(1, dp(dpH)))

  fun showListening() = show(false, null) { c ->
    header(c, "Zorka", null)
    gap(c, 6)
    c.addView(text("Listening… tap the tiger when you're done.", 16f, CREAM))
  }

  fun showThinking() = show(false, null) { c ->
    header(c, "Zorka", null)
    gap(c, 6)
    c.addView(text("Working on it…", 16f, CREAM))
  }

  fun showTyping() = show(true, null) { c ->
    header(c, "Tell Zorka", null)
    gap(c, 8)
    val field = EditText(context).apply {
      hint = "Had poha, start a walk… or how's my week?"
      setHintTextColor(MUTED)
      setTextColor(CREAM)
      background = rounded(SURFACE, 16, OUTLINE)
      setPadding(dp(12), dp(10), dp(12), dp(10))
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or InputType.TYPE_TEXT_FLAG_MULTI_LINE
      imeOptions = EditorInfo.IME_ACTION_SEND
      maxLines = 4
    }
    c.addView(field)
    gap(c, 10)
    c.addView(
      button("Send", true) {
        val words = field.text.toString().trim()
        if (words.isEmpty()) {
          hide()
          return@button
        }
        events.onSend(words.take(1000))
      },
    )
    field.requestFocus()
    handler.postDelayed({
      (context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(field, InputMethodManager.SHOW_IMPLICIT)
    }, 150)
  }

  fun showMessage(message: String, openApp: String?) = show(false, MESSAGE_MS) { c ->
    header(c, "Zorka", openApp)
    gap(c, 6)
    c.addView(text(message, 16f, CREAM))
  }

  /** A turn's result (overlayView.ts, phase "result" or "message"). */
  fun showView(view: JSONObject) {
    if (view.optString("phase") == "message") {
      showMessage(view.optString("text"), view.optString("openApp").ifEmpty { null })
      return
    }
    val messageId = view.optString("messageId")
    val sticky = view.optBoolean("sticky", false)
    show(false, if (sticky) null else UNDO_WINDOW_MS) { c ->
      header(c, "Zorka", "zorka://coach")
      val heard = view.optString("heard")
      if (heard.isNotEmpty() && !view.isNull("heard")) {
        gap(c, 4)
        c.addView(text("Heard: “$heard”", 13f, MUTED))
        val note = view.optString("heardNote")
        if (note.isNotEmpty() && !view.isNull("heardNote")) c.addView(text(note, 13f, AMBER))
      }
      val reply = view.optString("reply")
      if (reply.isNotEmpty()) {
        gap(c, 8)
        c.addView(text(reply, 16f, CREAM).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE })
      }
      val rows = view.optJSONArray("rows")
      for (i in 0 until (rows?.length() ?: 0)) {
        val row = rows!!.getJSONObject(i)
        val state = row.optString("state")
        val faded = state == "undone" || state == "dismissed" || state == "refused"
        gap(c, 10)
        val box = LinearLayout(context).apply {
          orientation = LinearLayout.VERTICAL
          background = rounded(SURFACE, 16)
          setPadding(dp(12), dp(10), dp(12), dp(10))
        }
        val mark = if (state == "done") "✓ " else ""
        box.addView(text("$mark${row.optString("text")}", 15f, if (faded) MUTED else CREAM))
        val note = row.optString("note")
        if (note.isNotEmpty() && !row.isNull("note")) box.addView(text(note, 13f, AMBER))
        val buttons = row.optJSONArray("buttons")
        if (buttons != null && buttons.length() > 0) {
          val strip = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
          for (b in 0 until buttons.length()) {
            val btn = buttons.getJSONObject(b)
            val id = btn.optString("id")
            strip.addView(
              button(btn.optString("label"), btn.optBoolean("primary", false)) {
                handler.removeCallbacks(hideLater)
                events.onAction(messageId, row.optInt("index"), id)
              },
              LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                marginEnd = dp(8)
              },
            )
          }
          box.addView(
            HorizontalScrollView(context).apply {
              isHorizontalScrollBarEnabled = false
              addView(strip)
            },
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
              topMargin = dp(8)
            },
          )
        }
        c.addView(box)
      }
    }
  }

  fun hide() {
    handler.removeCallbacks(hideLater)
    root?.let { wm.removeView(it) }
    root = null
    params = null
  }

  val visible get() = root != null

  companion object {
    val INK = Color.parseColor("#151619")
    val SURFACE = Color.parseColor("#22242A")
    val CREAM = Color.parseColor("#F9F4EB")
    val MUTED = Color.parseColor("#A3A39C")
    val LIME = Color.parseColor("#D8ED62")
    val AMBER = Color.parseColor("#F2B84B")
    val OUTLINE = Color.parseColor("#3A3D44")
    private const val UNDO_WINDOW_MS = 10_000L
    private const val MESSAGE_MS = 6_000L
  }
}
