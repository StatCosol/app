package com.statcosol.attendance.face

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import androidx.core.content.ContextCompat
import com.statcosol.attendance.R
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * Real-time face-scan HUD: live face box, quality ring, yaw compass, step
 * progress, and frame counter. Sits on top of the camera preview.
 */
class FaceScanOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    private var preview: FaceScanPreview = FaceScanPreview(null, null, null, false, false)
    private var progress: ScanProgress = ScanProgress()
    private var phase: ScanPhase = ScanPhase.IDLE
    private var mirrorX: Boolean = true

    private val boxPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = dp(3f)
    }
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        textSize = dp(13f)
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        textSize = dp(11f)
    }
    private val dimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(140, 0, 0, 0)
        style = Paint.Style.FILL
    }

    private val faceRect = RectF()
    private val ringRect = RectF()
    private var pulse = 1f
    private var qualityAnim = 0f

    private val colorGood = ContextCompat.getColor(context, R.color.scan_good)
    private val colorWarn = ContextCompat.getColor(context, R.color.scan_warn)
    private val colorBad = ContextCompat.getColor(context, R.color.scan_bad)
    private val colorAccent = ContextCompat.getColor(context, R.color.brand_accent)
    private val colorMuted = ContextCompat.getColor(context, R.color.scan_muted)

    private val pulseAnimator = ValueAnimator.ofFloat(0.92f, 1.06f).apply {
        duration = 900
        repeatMode = ValueAnimator.REVERSE
        repeatCount = ValueAnimator.INFINITE
        addUpdateListener {
            pulse = it.animatedValue as Float
            invalidate()
        }
    }

    init {
        setWillNotDraw(false)
    }

    fun setMirrorForFrontCamera(mirror: Boolean) {
        mirrorX = mirror
        invalidate()
    }

    fun updatePreview(p: FaceScanPreview) {
        preview = p
        val targetQ = p.metrics?.captureQuality?.toFloat() ?: 0f
        qualityAnim += (targetQ - qualityAnim) * 0.35f
        invalidate()
    }

    fun updateProgress(p: ScanProgress) {
        progress = p
        phase = p.phase
        invalidate()
    }

    fun setPhase(p: ScanPhase) {
        phase = p
        invalidate()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (!pulseAnimator.isRunning) pulseAnimator.start()
    }

    override fun onDetachedFromWindow() {
        pulseAnimator.cancel()
        super.onDetachedFromWindow()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (width == 0 || height == 0) return

        drawVignette(canvas)
        drawStepIndicator(canvas)
        drawYawCompass(canvas)
        drawQualityBar(canvas)
        drawFaceGuide(canvas)
        drawFrameCounter(canvas)
    }

    /** Darken edges so the face oval stands out. */
    private fun drawVignette(canvas: Canvas) {
        val cx = width / 2f
        val cy = height * FaceKioskTuning.OVERLAY_FACE_CENTER_Y_FRACTION
        val rx = width * FaceKioskTuning.OVERLAY_OVAL_RX_FRACTION
        val ry = height * FaceKioskTuning.OVERLAY_OVAL_RY_FRACTION
        val path = Path().apply {
            addRect(0f, 0f, width.toFloat(), height.toFloat(), Path.Direction.CW)
            addOval(cx - rx, cy - ry, cx + rx, cy + ry, Path.Direction.CCW)
            fillType = Path.FillType.EVEN_ODD
        }
        canvas.drawPath(path, dimPaint)
    }

    private fun drawStepIndicator(canvas: Canvas) {
        if (phase == ScanPhase.IDLE || phase == ScanPhase.CAPTURING) return
        val labels = listOf("Front", "Left", "Right", "Blink")
        val steps = labels.size
        val y = height * 0.12f
        val spacing = width / (steps + 1f)
        for (i in 0 until steps) {
            val x = spacing * (i + 1)
            val active = i == progress.stepIndex
            val done = i < progress.stepIndex || phase == ScanPhase.DONE
            fillPaint.color = when {
                done -> colorGood
                active -> colorAccent
                else -> colorMuted
            }
            val r = if (active) dp(7f) * pulse else dp(6f)
            canvas.drawCircle(x, y, r, fillPaint)
            labelPaint.color = if (active || done) Color.WHITE else Color.argb(160, 255, 255, 255)
            canvas.drawText(labels[i], x, y + dp(18f), labelPaint)
        }
    }

    /** Arc showing current head yaw vs target direction. */
    private fun drawYawCompass(canvas: Canvas) {
        if (phase == ScanPhase.IDLE || phase == ScanPhase.DONE) return
        val metrics = preview.metrics ?: return
        val cx = width / 2f
        val cy = height * FaceKioskTuning.OVERLAY_FACE_CENTER_Y_FRACTION
        val radius = min(width, height) * (FaceKioskTuning.OVERLAY_OVAL_RX_FRACTION + 0.02f)

        ringPaint.strokeWidth = dp(2f)
        ringPaint.color = colorMuted
        canvas.drawArc(cx - radius, cy - radius, cx + radius, cy + radius, 200f, 140f, false, ringPaint)

        val target = FaceScanGuidance.targetYaw(phase) ?: 0f
        val yaw = metrics.headYaw.coerceIn(-45f, 45f)
        val targetAngle = -target * 2f + 270f
        val currentAngle = -yaw * 2f + 270f

        ringPaint.color = colorAccent
        ringPaint.strokeWidth = dp(3f)
        drawCompassTick(canvas, cx, cy, radius - dp(8f), targetAngle, dp(14f))

        val status = FaceScanGuidance.alignmentStatus(preview, phase)
        ringPaint.color = when (status) {
            AlignmentStatus.GOOD -> colorGood
            AlignmentStatus.WRONG_ANGLE -> colorWarn
            else -> colorBad
        }
        drawCompassTick(canvas, cx, cy, radius - dp(4f), currentAngle, dp(10f))

        val yawLabel = "${yaw.toInt()}°"
        textPaint.textSize = dp(12f)
        canvas.drawText(yawLabel, cx, cy + radius + dp(22f), textPaint)
    }

    private fun drawCompassTick(
        canvas: Canvas,
        cx: Float,
        cy: Float,
        radius: Float,
        angleDeg: Float,
        len: Float,
    ) {
        val rad = Math.toRadians(angleDeg.toDouble())
        val x1 = cx + radius * cos(rad).toFloat()
        val y1 = cy + radius * sin(rad).toFloat()
        val x2 = cx + (radius - len) * cos(rad).toFloat()
        val y2 = cy + (radius - len) * sin(rad).toFloat()
        canvas.drawLine(x1, y1, x2, y2, ringPaint)
    }

    private fun drawQualityBar(canvas: Canvas) {
        val metrics = preview.metrics ?: return
        val barW = dp(8f)
        val barH = height * 0.22f
        val left = width - dp(24f) - barW
        val top = height * 0.32f
        fillPaint.color = colorMuted
        canvas.drawRoundRect(left, top, left + barW, top + barH, dp(4f), dp(4f), fillPaint)
        val frac = FaceScanGuidance.qualityColorFraction(qualityAnim.toDouble())
        val qColor = qualityColor(frac)
        fillPaint.color = qColor
        val fillTop = top + barH * (1f - frac)
        canvas.drawRoundRect(left, fillTop, left + barW, top + barH, dp(4f), dp(4f), fillPaint)
        labelPaint.textSize = dp(10f)
        labelPaint.color = Color.WHITE
        canvas.drawText("Q", left + barW / 2f, top - dp(6f), labelPaint)
        canvas.drawText("${(frac * 100).toInt()}%", left + barW / 2f, top + barH + dp(14f), labelPaint)
    }

    private fun drawFaceGuide(canvas: Canvas) {
        val box = preview.faceBox
        val cx = width / 2f
        val cy = height * FaceKioskTuning.OVERLAY_FACE_CENTER_Y_FRACTION
        val defaultRx = width * FaceKioskTuning.OVERLAY_OVAL_RX_FRACTION
        val defaultRy = height * FaceKioskTuning.OVERLAY_OVAL_RY_FRACTION

        if (box != null) {
            mapBox(box, faceRect)
            val pad = dp(12f)
            ringRect.set(
                faceRect.left - pad,
                faceRect.top - pad,
                faceRect.right + pad,
                faceRect.bottom + pad,
            )
        } else {
            ringRect.set(cx - defaultRx, cy - defaultRy, cx + defaultRx, cy + defaultRy)
        }

        val status = FaceScanGuidance.alignmentStatus(preview, phase)
        val ringColor = when (status) {
            AlignmentStatus.GOOD -> colorGood
            AlignmentStatus.HOLD_STILL, AlignmentStatus.WRONG_ANGLE -> colorWarn
            else -> colorBad
        }
        boxPaint.color = ringColor
        boxPaint.strokeWidth = if (preview.frameAccepted) dp(4f) else dp(3f)
        canvas.drawOval(ringRect, boxPaint)

        if (preview.frameAccepted) {
            fillPaint.color = Color.argb(40, Color.red(ringColor), Color.green(ringColor), Color.blue(ringColor))
            canvas.drawOval(ringRect, fillPaint)
        }

        // Progress arc around the face oval
        if (progress.requiredFrames > 0) {
            val sweep = 360f * progress.currentFrames / progress.requiredFrames
            ringPaint.color = colorAccent
            ringPaint.strokeWidth = dp(5f)
            canvas.drawArc(ringRect, -90f, sweep, false, ringPaint)
        }

        // Live face bounding box from ML Kit
        if (box != null) {
            mapBox(box, faceRect)
            boxPaint.color = Color.argb(180, 255, 255, 255)
            boxPaint.strokeWidth = dp(1.5f)
            canvas.drawRoundRect(faceRect, dp(8f), dp(8f), boxPaint)
        }
    }

    private fun drawFrameCounter(canvas: Canvas) {
        if (progress.requiredFrames <= 0) return
        val text = when (phase) {
            ScanPhase.CAPTURING -> context.getString(
                R.string.facedesk_capturing,
                progress.currentFrames,
                progress.requiredFrames,
            )
            ScanPhase.FRONT, ScanPhase.LEFT, ScanPhase.RIGHT -> {
                val label = when (phase) {
                    ScanPhase.LEFT -> "Left"
                    ScanPhase.RIGHT -> "Right"
                    else -> "Front"
                }
                "$label ${progress.currentFrames}/${progress.requiredFrames}"
            }
            ScanPhase.BLINK -> if (progress.blinked) "Blink ✓" else "Blink now"
            else -> null
        } ?: return
        textPaint.textSize = dp(16f)
        textPaint.color = Color.WHITE
        canvas.drawText(text, width / 2f, height * 0.70f, textPaint)
    }

    private fun mapBox(normalized: RectF, out: RectF) {
        val l = if (mirrorX) 1f - normalized.right else normalized.left
        val r = if (mirrorX) 1f - normalized.left else normalized.right
        out.set(
            l * width,
            normalized.top * height,
            r * width,
            normalized.bottom * height,
        )
    }

    private fun qualityColor(frac: Float): Int {
        return when {
            frac >= 0.7f -> colorGood
            frac >= 0.45f -> colorWarn
            else -> colorBad
        }
    }

    private fun dp(v: Float): Float = v * resources.displayMetrics.density
}
