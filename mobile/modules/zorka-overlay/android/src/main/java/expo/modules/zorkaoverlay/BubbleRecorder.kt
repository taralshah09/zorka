// The bubble's microphone: the app's voice-note format (D32: AAC in m4a, mono, 16 kHz, 32 kbps), a level from 0 to 1
// for the tiger to move with, and the plan's limits (stops itself after 2 s of quiet once something was said, or at
// 60 s; under 0.6 s counts as nothing heard).
package expo.modules.zorkaoverlay

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.io.File
import kotlin.math.log10

internal class BubbleRecorder(
  private val context: Context,
  private val onLevel: (Float) -> Unit,
  /** Called on the main thread when the recording ends by itself (silence or the time limit). */
  private val onAutoStop: () -> Unit,
) {
  private var recorder: MediaRecorder? = null
  private var file: File? = null
  private var startedAt = 0L
  private var loudAt = 0L
  private val handler = Handler(Looper.getMainLooper())

  val recording get() = recorder != null

  private val meter = object : Runnable {
    override fun run() {
      val r = recorder ?: return
      val amp = try { r.maxAmplitude } catch (_: RuntimeException) { 0 }
      val level = if (amp <= 0) 0f else ((20 * log10(amp / 32767.0) + 60) / 60).toFloat().coerceIn(0f, 1f)
      onLevel(level)
      val now = System.currentTimeMillis()
      if (level >= SILENCE_LEVEL) loudAt = now
      val elapsed = now - startedAt
      if (elapsed >= MAX_MS || (elapsed > 1_200 && now - loudAt > SILENCE_MS)) {
        onAutoStop()
        return
      }
      handler.postDelayed(this, 80)
    }
  }

  /** Throws when the mic can't be opened (another app holds it, or Android refused). */
  fun start() {
    val out = File(context.cacheDir, "zorka-bubble-${System.currentTimeMillis()}.m4a")
    @Suppress("DEPRECATION")
    val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context) else MediaRecorder()
    try {
      r.setAudioSource(MediaRecorder.AudioSource.MIC)
      r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      r.setAudioSamplingRate(16_000)
      r.setAudioChannels(1)
      r.setAudioEncodingBitRate(32_000)
      r.setOutputFile(out.absolutePath)
      r.prepare()
      r.start()
    } catch (e: Exception) {
      r.release()
      out.delete()
      throw e
    }
    recorder = r
    file = out
    startedAt = System.currentTimeMillis()
    loudAt = startedAt
    handler.post(meter)
  }

  /** The recording's path, or null when it was too short or failed (the file is then deleted). */
  fun stop(): String? {
    handler.removeCallbacks(meter)
    val r = recorder ?: return null
    val out = file
    recorder = null
    file = null
    val long = System.currentTimeMillis() - startedAt >= MIN_MS
    val ok = try {
      r.stop()
      true
    } catch (_: RuntimeException) {
      false // stop() throws when nothing was captured
    } finally {
      r.release()
    }
    onLevel(0f)
    if (!ok || !long || out == null) {
      out?.delete()
      return null
    }
    return out.absolutePath
  }

  companion object {
    private const val MAX_MS = 60_000L
    private const val MIN_MS = 600L
    private const val SILENCE_MS = 2_000L
    private const val SILENCE_LEVEL = 0.35f
  }
}
