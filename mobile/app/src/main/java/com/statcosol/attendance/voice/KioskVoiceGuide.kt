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

    /**
     * True while an outcome — a punch result or a refusal — is still being read
     * out, so routine frame-loop hints leave it alone.
     *
     * Every utterance goes out as QUEUE_FLUSH, which cancels whatever is mid-
     * sentence. Capture hints fire several times a second, so the important
     * messages were the ones getting cut off: "Attendance already recorded,
     * please wait 3 more minutes" would be clipped after a couple of words by
     * the next "no face detected". The person who most needed to hear a full
     * sentence was the one guaranteed not to.
     */
    @Volatile private var speakingOutcome = false

    init {
        tts = TextToSpeech(appContext) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            if (ttsReady) {
                configureLanguage(Locale.getDefault())
                attachOutcomeListener()
            } else {
                Log.w(TAG, "TTS engine unavailable (status=$status)")
            }
        }
    }

    private fun attachOutcomeListener() {
        runCatching {
            tts?.setOnUtteranceProgressListener(
                object : android.speech.tts.UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) = Unit

                    override fun onDone(utteranceId: String?) {
                        if (utteranceId?.startsWith(OUTCOME_PREFIX) == true) {
                            speakingOutcome = false
                        }
                    }

                    @Deprecated("Required by the base class")
                    override fun onError(utteranceId: String?) {
                        if (utteranceId?.startsWith(OUTCOME_PREFIX) == true) {
                            speakingOutcome = false
                        }
                    }

                    override fun onError(utteranceId: String?, errorCode: Int) {
                        if (utteranceId?.startsWith(OUTCOME_PREFIX) == true) {
                            speakingOutcome = false
                        }
                    }

                    // A new utterance flushing this one still ends it, and
                    // without this the flag would stick and mute the kiosk.
                    override fun onStop(utteranceId: String?, interrupted: Boolean) {
                        if (utteranceId?.startsWith(OUTCOME_PREFIX) == true) {
                            speakingOutcome = false
                        }
                    }
                },
            )
        }
    }

    /**
     * Say something that must be heard in full: a punch result, or why one was
     * refused. Interrupts whatever is being said, and is then protected from
     * being interrupted itself until it finishes.
     */
    fun speakOutcome(text: String) {
        if (!ttsReady || text.isBlank()) return
        lastKey = text
        lastSpokenAtMs = SystemClock.elapsedRealtime()
        speakingOutcome = true
        try {
            if (!configureLanguage(Locale.getDefault())) {
                configureLanguage(Locale.ENGLISH)
            }
            tts?.speak(
                text,
                TextToSpeech.QUEUE_FLUSH,
                null,
                "$OUTCOME_PREFIX${SystemClock.elapsedRealtime()}",
            )
        } catch (e: Exception) {
            speakingOutcome = false
            Log.w(TAG, "speakOutcome failed: ${e.message}")
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
        // Never talk over a result. These are frame-loop hints; they repeat
        // constantly and losing one costs nothing, whereas cutting off "please
        // wait 3 more minutes" costs the person their answer.
        if (speakingOutcome) return
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

        /** Marks an utterance as a result the frame-loop hints must not cut off. */
        private const val OUTCOME_PREFIX = "kiosk-outcome-"
    }
}
