// The Zorka bubble (docs/ASSISTANT_BAR_PLAN.md, D89): a small tiger on the edge of the screen, over every app. Tap it
// to talk (tap again, or 2 s of quiet, to send), hold it to type, drag it anywhere (it snaps to the nearest edge).
// The tiger shows the state: it grows with your voice while listening, pulses while Zorka works, bounces when something
// was done, leans when it needs you, shakes when it can't help, and dims when turns are waiting for the network.
// A foreground service keeps it alive (special use, with its notification), and adds the microphone type only while
// it records. Each request runs as the headless JS task (AssistantTaskService); its answer comes back via render().
package expo.modules.zorkaoverlay

import android.Manifest
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.lang.ref.WeakReference
import kotlin.math.abs

class OverlayService : Service(), OverlayCard.Events {
  private lateinit var wm: WindowManager
  private lateinit var card: OverlayCard
  private var bubble: FrameLayout? = null
  private var tiger: ImageView? = null
  private var params: WindowManager.LayoutParams? = null
  private lateinit var recorder: BubbleRecorder
  private val handler = Handler(Looper.getMainLooper())
  private var busy = false
  private var pulse: ValueAnimator? = null

  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    card = OverlayCard(this, wm, this)
    recorder = BubbleRecorder(this, ::onLevel) { handler.post { stopListening() } }
    goForeground(withMic = false)
    instance = WeakReference(this)
    running = true
    if (Settings.canDrawOverlays(this)) addBubble() else stopSelf()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_TURN_OFF) {
      OverlayPrefs.setEnabled(this, false)
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  override fun onDestroy() {
    recorder.stop()
    pulse?.cancel()
    card.hide()
    bubble?.let { wm.removeView(it) }
    bubble = null
    running = false
    instance = null
    super.onDestroy()
  }

  // ── Foreground service ───────────────────────────────────────────────────────────────────────

  private fun notification(): Notification {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null)
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Zorka bubble", NotificationManager.IMPORTANCE_MIN).apply {
        description = "Shown while the Zorka bubble is on. Android needs it to keep the bubble on screen."
        setShowBadge(false)
      })
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val openPending = open?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE) }
    val off = PendingIntent.getService(
      this,
      1,
      Intent(this, OverlayService::class.java).setAction(ACTION_TURN_OFF),
      PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.zorka_tiger)
      .setContentTitle("Zorka bubble is on")
      .setContentText("Tap the tiger in any app to talk. Hold it to type.")
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setContentIntent(openPending)
      .addAction(0, "Turn off", off)
      .build()
  }

  /**
   * Special use keeps the bubble alive; the microphone type is added only while recording. Android allows the switch
   * because the user just tapped our visible overlay. Throws SecurityException if a build of Android refuses it.
   */
  private fun goForeground(withMic: Boolean) {
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE or (if (withMic) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0)
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && withMic) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    } else {
      0
    }
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(), type)
  }

  // ── The bubble ───────────────────────────────────────────────────────────────────────────────

  @SuppressLint("ClickableViewAccessibility")
  private fun addBubble() {
    val size = dp(BUBBLE_DP)
    val image = ImageView(this).apply {
      setImageResource(R.drawable.zorka_tiger)
      scaleType = ImageView.ScaleType.FIT_CENTER
    }
    val view = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(OverlayCard.INK)
        setStroke(dp(1), OverlayCard.OUTLINE)
      }
      elevation = dp(6).toFloat()
      contentDescription = "Talk to Zorka"
      addView(image, FrameLayout.LayoutParams(dp(BUBBLE_DP - 16), dp(BUBBLE_DP - 16), Gravity.CENTER))
    }
    val metrics = resources.displayMetrics
    val saved = OverlayPrefs.position(this)
    val p = WindowManager.LayoutParams(
      size,
      size,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = saved?.first ?: (metrics.widthPixels - size)
      y = saved?.second ?: (metrics.heightPixels * 0.55).toInt()
    }
    view.setOnTouchListener(DragAndTap())
    wm.addView(view, p)
    bubble = view
    tiger = image
    params = p
  }

  private inner class DragAndTap : View.OnTouchListener {
    private var downX = 0f
    private var downY = 0f
    private var startX = 0
    private var startY = 0
    private var dragging = false
    private var held = false
    private val slop = ViewConfiguration.get(this@OverlayService).scaledTouchSlop
    private val hold = Runnable {
      held = true
      bubble?.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
      startTyping()
    }

    override fun onTouch(v: View, e: MotionEvent): Boolean {
      val p = params ?: return false
      when (e.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downX = e.rawX
          downY = e.rawY
          startX = p.x
          startY = p.y
          dragging = false
          held = false
          handler.postDelayed(hold, ViewConfiguration.getLongPressTimeout().toLong())
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = e.rawX - downX
          val dy = e.rawY - downY
          if (!dragging && (abs(dx) > slop || abs(dy) > slop)) {
            dragging = true
            handler.removeCallbacks(hold)
          }
          if (dragging) {
            p.x = startX + dx.toInt()
            p.y = startY + dy.toInt()
            wm.updateViewLayout(v, p)
          }
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          handler.removeCallbacks(hold)
          if (dragging) snapToEdge(v, p)
          else if (!held && e.actionMasked == MotionEvent.ACTION_UP) onTap()
        }
      }
      return true
    }
  }

  private fun snapToEdge(v: View, p: WindowManager.LayoutParams) {
    val metrics = resources.displayMetrics
    val target = if (p.x + v.width / 2 < metrics.widthPixels / 2) 0 else metrics.widthPixels - v.width
    p.y = p.y.coerceIn(dp(24), metrics.heightPixels - v.height - dp(24))
    ValueAnimator.ofInt(p.x, target).apply {
      duration = 180
      addUpdateListener {
        p.x = it.animatedValue as Int
        if (bubble != null) wm.updateViewLayout(v, p)
      }
      start()
    }
    OverlayPrefs.savePosition(this, target, p.y)
  }

  // ── Talking ──────────────────────────────────────────────────────────────────────────────────

  private fun onTap() {
    if (recorder.recording) {
      stopListening()
      return
    }
    if (busy) {
      card.showThinking()
      return
    }
    startListening()
  }

  private fun startListening() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      card.showMessage("Zorka needs the microphone to hear you. Hold the tiger to type instead.", "zorka://settings")
      return
    }
    try {
      goForeground(withMic = true)
      recorder.start()
    } catch (e: Exception) {
      try {
        goForeground(withMic = false)
      } catch (_: Exception) {
        // The service keeps its earlier foreground state.
      }
      card.showMessage("Android didn't let the bubble use the microphone just now. Open Zorka once, then try again.", "zorka://settings")
      return
    }
    vibrate()
    card.showListening()
    bubble?.background = (bubble?.background as? GradientDrawable)?.apply { setStroke(dp(2), OverlayCard.LIME) }
  }

  private fun stopListening() {
    val path = recorder.stop()
    try {
      goForeground(withMic = false)
    } catch (_: Exception) {
      // Keep running with the previous type.
    }
    bubble?.background = (bubble?.background as? GradientDrawable)?.apply { setStroke(dp(1), OverlayCard.OUTLINE) }
    vibrate()
    if (path == null) {
      card.showMessage("I didn't catch that. Tap the tiger and talk, or hold it to type.", null)
      blink()
      return
    }
    working()
    AssistantTaskService.turnFromAudio(this, path)
  }

  private fun startTyping() {
    if (recorder.recording) recorder.stop()
    card.showTyping()
  }

  private fun working() {
    busy = true
    card.showThinking()
    pulse?.cancel()
    pulse = ValueAnimator.ofFloat(1f, 0.55f).apply {
      duration = 600
      repeatMode = ValueAnimator.REVERSE
      repeatCount = ValueAnimator.INFINITE
      addUpdateListener { tiger?.alpha = it.animatedValue as Float }
      start()
    }
  }

  private fun onLevel(level: Float) {
    val s = 1f + level * 0.18f
    tiger?.scaleX = s
    tiger?.scaleY = s
  }

  // ── Card events ──────────────────────────────────────────────────────────────────────────────

  override fun onAction(messageId: String, index: Int, action: String) {
    working()
    AssistantTaskService.action(this, messageId, index, action)
  }

  override fun onSend(text: String) {
    working()
    AssistantTaskService.turnFromText(this, text)
  }

  override fun onOpen(url: String) = Launch.openUrl(this, url)

  // ── Answers from the headless task ───────────────────────────────────────────────────────────

  private fun show(json: String) {
    busy = false
    pulse?.cancel()
    tiger?.alpha = 1f
    val view = try {
      JSONObject(json)
    } catch (_: Exception) {
      card.showMessage("Something went wrong. Try again.", null)
      return
    }
    when (view.optString("mood")) {
      "happy" -> bounce()
      "tilt" -> tilt()
      "shake" -> shake()
      "sleepy" -> tiger?.alpha = 0.55f
    }
    card.showView(view)
  }

  private fun bounce() {
    val t = tiger ?: return
    t.animate().scaleX(1.18f).scaleY(1.18f).translationY(-dp(4).toFloat()).setDuration(160).withEndAction {
      t.animate().scaleX(1f).scaleY(1f).translationY(0f).setDuration(220).start()
    }.start()
  }

  private fun tilt() {
    val t = tiger ?: return
    t.animate().rotation(12f).setDuration(220).withEndAction {
      handler.postDelayed({ t.animate().rotation(0f).setDuration(260).start() }, 700)
    }.start()
  }

  private fun shake() {
    val t = tiger ?: return
    val steps = floatArrayOf(-9f, 9f, -6f, 5f, 0f)
    var i = 0
    fun next() {
      if (i >= steps.size) return
      t.animate().rotation(steps[i++]).setDuration(90).withEndAction { next() }.start()
    }
    next()
  }

  private fun blink() {
    val t = tiger ?: return
    t.animate().scaleY(0.82f).setDuration(70).withEndAction { t.animate().scaleY(1f).setDuration(110).start() }.start()
  }

  private fun vibrate() {
    val v = ContextCompat.getSystemService(this, Vibrator::class.java) ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) v.vibrate(VibrationEffect.createOneShot(20, VibrationEffect.DEFAULT_AMPLITUDE))
  }

  companion object {
    private const val CHANNEL = "zorka_bubble"
    private const val NOTIFICATION_ID = 4107
    private const val ACTION_TURN_OFF = "expo.modules.zorkaoverlay.TURN_OFF"
    private const val BUBBLE_DP = 56

    @Volatile var running = false
      private set
    private var instance: WeakReference<OverlayService>? = null

    fun start(c: Context) {
      if (!Settings.canDrawOverlays(c)) return
      ContextCompat.startForegroundService(c, Intent(c, OverlayService::class.java))
    }

    fun stop(c: Context) {
      c.stopService(Intent(c, OverlayService::class.java))
    }

    /** From the headless task (any thread): shows its view model in the card. Ignored when the bubble is off. */
    fun render(json: String) {
      Handler(Looper.getMainLooper()).post { instance?.get()?.show(json) }
    }
  }
}
