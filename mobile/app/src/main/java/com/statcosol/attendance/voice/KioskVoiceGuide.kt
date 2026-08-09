package com.statcosol.attendance.voice

import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import android.util.Log
import androidx.annotation.StringRes
import java.util.Locale

/**
 * Spoken prompts for kiosk flows. Wraps Android TTS with locale selection and
 * debouncing so frame-loop hints do not spam the speaker.
 */
class KioskVoiceGuide(context: Context) {

    private val appContext = context.applicationContext
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var lastKey: String? = null
    private var lastSpokenAtMs = 0L

    init {
        tts = TextToSpeech(appContext) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            if (ttsReady) {
                configureLanguage(Locale.getDefault())
            } else {
                Log.w(TAG, "TTS engine unavailable (status=$status)")
            }
        }
    }

    fun speakRes(
        @StringRes resId: Int,
        key: String? = null,
        minIntervalMs: Long = DEFAULT_MIN_INTERVAL_MS,
        vararg formatArgs: Any,
    ) {
        val text = appContext.getString(resId, *formatArgs)
        val entry = runCatching { appContext.resources.getResourceEntryName(resId) }
            .getOrDefault(resId.toString())
        speak(text, key ?: entry, minIntervalMs)
    }

    fun speak(text: String, key: String? = null, minIntervalMs: Long = DEFAULT_MIN_INTERVAL_MS) {
        if (!ttsReady || text.isBlank()) return
        val now = SystemClock.elapsedRealtime()
        val dedupeKey = key ?: text
        if (dedupeKey == lastKey && now - lastSpokenAtMs < minIntervalMs) return
        lastKey = dedupeKey
        lastSpokenAtMs = now
        try {
            if (!configureLanguage(Locale.getDefault())) {
                configureLanguage(Locale.ENGLISH)
            }
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "kiosk-$dedupeKey")
        } catch (e: Exception) {
            Log.w(TAG, "speak failed: ${e.message}")
        }
    }

    fun shutdown() {
        runCatching { tts?.stop() }
        runCatching { tts?.shutdown() }
        tts = null
        ttsReady = false
    }

    private fun configureLanguage(locale: Locale): Boolean {
        val engine = tts ?: return false
        val available = runCatching { engine.isLanguageAvailable(locale) }
            .getOrDefault(TextToSpeech.LANG_NOT_SUPPORTED)
        if (available < TextToSpeech.LANG_AVAILABLE) return false

        runCatching { engine.language = locale }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            runCatching {
                engine.voices
                    ?.filter { it.locale.language == locale.language }
                    ?.sortedWith(
                        compareBy(
                            { it.isNetworkConnectionRequired },
                            { it.name },
                        ),
                    )
                    ?.firstOrNull()
                    ?.let { engine.voice = it }
            }
        }
        runCatching { engine.setPitch(1.02f) }
        runCatching { engine.setSpeechRate(if (locale.language == "te") 0.82f else 0.92f) }
        return true
    }

    companion object {
        private const val TAG = "KioskVoiceGuide"
        private const val DEFAULT_MIN_INTERVAL_MS = 2_500L
    }
}
