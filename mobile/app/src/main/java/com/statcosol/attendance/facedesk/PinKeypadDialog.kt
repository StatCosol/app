package com.statcosol.attendance.facedesk

import android.app.Activity
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import com.statcosol.attendance.R

/**
 * Full big-button numeric keypad for kiosk PIN entry. Replaces the bare
 * EditText + system soft keyboard so unskilled workers just tap large keys —
 * no keyboard to summon, no tiny field to find.
 *
 *  fixedLength != null → the PIN auto-submits the instant that many digits are
 *                        entered (worker 4-digit PIN); there is no OK key.
 *  fixedLength == null → variable length with an OK key (admin PIN, 4–12).
 *
 * The entered PIN is always masked as dots on screen for privacy at a shared
 * kiosk.
 */
object PinKeypadDialog {

    private const val MAX_VARIABLE = 12

    fun show(
        activity: Activity,
        title: String,
        message: String? = null,
        fixedLength: Int? = 4,
        cancelable: Boolean = false,
        onSubmit: (String) -> Unit,
        onCancel: (() -> Unit)? = null,
    ): AlertDialog {
        val density = activity.resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        val entered = StringBuilder()

        val root = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(24), dp(24), dp(16))
            gravity = Gravity.CENTER_HORIZONTAL
        }

        root.addView(
            TextView(activity).apply {
                text = title
                textSize = 22f
                setTypeface(typeface, Typeface.BOLD)
                gravity = Gravity.CENTER
                setTextColor(0xFF0F172A.toInt())
            },
        )
        if (!message.isNullOrBlank()) {
            root.addView(
                TextView(activity).apply {
                    text = message
                    textSize = 15f
                    gravity = Gravity.CENTER
                    setTextColor(0xFF475569.toInt())
                    setPadding(0, dp(6), 0, 0)
                },
            )
        }

        val dots = TextView(activity).apply {
            textSize = 34f
            gravity = Gravity.CENTER
            letterSpacing = 0.35f
            setTextColor(0xFF1E40AF.toInt())
            setPadding(0, dp(18), 0, dp(18))
        }
        root.addView(dots)

        fun renderDots() {
            dots.text = if (fixedLength != null) {
                buildString {
                    for (i in 0 until fixedLength) append(if (i < entered.length) "●" else "○")
                }
            } else {
                if (entered.isEmpty()) "○" else "●".repeat(entered.length)
            }
        }
        renderDots()

        lateinit var dialog: AlertDialog

        fun submit() {
            val pin = entered.toString()
            if (pin.isEmpty()) return
            dialog.dismiss()
            onSubmit(pin)
        }

        // Fixed-length auto-submit is deferred ~120ms so the last dot is seen
        // filling. Revalidate the length when it fires — a backspace inside that
        // window must not submit a now-too-short PIN — and cancel it outright on
        // backspace so a stale runnable can never race the edit.
        val autoSubmit = Runnable {
            if (fixedLength != null && entered.length == fixedLength) submit()
        }

        val keySize = dp(74)
        val keyMargin = dp(6)

        fun spacer(): View = View(activity).apply {
            layoutParams = GridLayout.LayoutParams().apply {
                width = keySize
                height = keySize
                setMargins(keyMargin, keyMargin, keyMargin, keyMargin)
            }
        }

        fun makeKey(label: String, brand: Boolean = false, onClick: () -> Unit): TextView =
            TextView(activity).apply {
                text = label
                textSize = 26f
                gravity = Gravity.CENTER
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(if (brand) 0xFF1E40AF.toInt() else 0xFF0F172A.toInt())
                setBackgroundResource(R.drawable.bg_pin_key)
                isClickable = true
                isFocusable = true
                layoutParams = GridLayout.LayoutParams().apply {
                    width = keySize
                    height = keySize
                    setMargins(keyMargin, keyMargin, keyMargin, keyMargin)
                }
                setOnClickListener { onClick() }
            }

        fun addDigit(d: Char) {
            val cap = fixedLength ?: MAX_VARIABLE
            if (entered.length >= cap) return
            entered.append(d)
            renderDots()
            if (fixedLength != null && entered.length == fixedLength) {
                dots.removeCallbacks(autoSubmit)
                dots.postDelayed(autoSubmit, 120)
            }
        }

        fun backspace() {
            if (entered.isNotEmpty()) {
                // Cancel any queued auto-submit — the PIN is being edited.
                dots.removeCallbacks(autoSubmit)
                entered.deleteCharAt(entered.length - 1)
                renderDots()
            }
        }

        val grid = GridLayout(activity).apply {
            columnCount = 3
            rowCount = 4
        }
        for (n in 1..9) grid.addView(makeKey(n.toString()) { addDigit('0' + n) })
        // Bottom row. Variable-length (admin) keeps a real OK key: [⌫ | 0 | OK].
        // Fixed-length (worker PIN, auto-submits) has no OK, so lay it out like a
        // standard passcode pad — [blank | 0 | ⌫] — keeping 0 centred under 2/5/8
        // and the delete key bottom-right instead of stranding an empty cell.
        if (fixedLength == null) {
            grid.addView(makeKey("⌫") { backspace() })
            grid.addView(makeKey("0") { addDigit('0') })
            grid.addView(makeKey("OK", brand = true) { submit() })
        } else {
            grid.addView(spacer())
            grid.addView(makeKey("0") { addDigit('0') })
            grid.addView(makeKey("⌫") { backspace() })
        }
        root.addView(grid)

        val builder = AlertDialog.Builder(activity)
            .setView(root)
            .setCancelable(cancelable)
        if (cancelable) {
            builder.setNegativeButton(android.R.string.cancel) { d, _ ->
                d.dismiss()
                onCancel?.invoke()
            }
        }
        dialog = builder.create()
        dialog.show()
        return dialog
    }
}
