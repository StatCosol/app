package com.statcosol.attendance.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.statcosol.attendance.R
import com.statcosol.attendance.facedesk.FaceDeskApiClient
import com.statcosol.attendance.facedesk.FaceDeskApiException
import com.statcosol.attendance.facedesk.FaceDeskAttendanceActivity
import com.statcosol.attendance.facedesk.FaceDeskEnrollPickerActivity
import com.statcosol.attendance.facedesk.FaceDeskRegisterRequest
import com.statcosol.attendance.prefs.DeviceConfig
import kotlinx.coroutines.launch
import java.util.Locale

/**
 * Token entry / device bootstrap. FaceDesk is the only attendance system now:
 * a valid install token registers the device as a FaceDesk kiosk and routes
 * straight into the full-screen attendance screen (or the enrollment picker for
 * an enrollment-mode device).
 */
class SetupActivity : AppCompatActivity() {

    private lateinit var config: DeviceConfig
    private lateinit var etToken: EditText
    private lateinit var etApiBase: EditText
    private lateinit var btnRegister: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var tvError: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        config = DeviceConfig(this)

        if (config.isRegistered()) {
            navigateToMain()
            return
        }

        setContentView(R.layout.activity_setup)

        etToken = findViewById(R.id.tokenInput)
        etApiBase = findViewById(R.id.apiInput)
        btnRegister = findViewById(R.id.registerBtn)
        progressBar = findViewById(R.id.progress)
        tvError = findViewById(R.id.statusText)

        btnRegister.setOnClickListener { attemptRegistration() }
    }

    private fun attemptRegistration() {
        val token = etToken.text.toString()
            .replace(Regex("\\s+"), "")
            .trim()
            .lowercase(Locale.US)
        val apiBase = normalizeApiBase(etApiBase.text.toString())

        if (!token.matches(Regex("[0-9a-fA-F]{64}"))) {
            tvError.text = getString(R.string.setup_invalid_token, token.length)
            tvError.visibility = View.VISIBLE
            return
        }

        tvError.visibility = View.GONE
        setLoading(true)

        if (apiBase.isNotBlank()) {
            config.apiBase = apiBase
            etApiBase.setText(apiBase)
        }
        config.installToken = token

        val androidId = android.provider.Settings.Secure.getString(
            contentResolver,
            android.provider.Settings.Secure.ANDROID_ID,
        ) ?: "unknown"

        lifecycleScope.launch {
            try {
                val fdClient = FaceDeskApiClient(config)
                val res = fdClient.register(
                    FaceDeskRegisterRequest(installToken = token, androidId = androidId)
                )
                config.deviceToken = res.deviceToken
                config.deviceId = res.deviceId
                config.deviceMode = "FACEDESK_${res.mode}" // FACEDESK_ATTENDANCE | FACEDESK_ENROLLMENT
                val enteredPin = findViewById<EditText>(R.id.adminPinInput).text.toString().trim()
                config.faceDeskAdminPin = enteredPin.ifBlank { res.adminPin }
                config.androidId = androidId
                navigateToMain()
            } catch (e: FaceDeskApiException) {
                setLoading(false)
                val msg = when (e.code) {
                    400 -> getString(R.string.setup_invalid_token, token.length)
                    401, 403 -> getString(R.string.setup_token_revoked)
                    404 -> getString(R.string.setup_invalid_device_token)
                    409 -> getString(R.string.setup_token_already_used)
                    410 -> getString(R.string.setup_token_expired)
                    426 -> getString(R.string.setup_update_app_required)
                    else -> getString(R.string.setup_registration_failed_with_code, e.code)
                }
                tvError.text = getString(
                    R.string.setup_error_with_token_hint,
                    msg,
                    token.length,
                    tokenFingerprint(token),
                )
                tvError.visibility = View.VISIBLE
            } catch (e: Exception) {
                setLoading(false)
                tvError.text = getString(R.string.setup_registration_network_failed, config.apiBase)
                tvError.visibility = View.VISIBLE
            }
        }
    }

    private fun normalizeApiBase(raw: String): String {
        val trimmed = raw.trim().trimEnd('/')
        if (trimmed.isBlank()) return ""
        val withScheme = if (trimmed.startsWith("http://", ignoreCase = true) ||
            trimmed.startsWith("https://", ignoreCase = true)
        ) {
            trimmed
        } else {
            "https://$trimmed"
        }
        return if (withScheme.equals("http://app.statcosol.com", ignoreCase = true)) {
            "https://app.statcosol.com"
        } else {
            withScheme
        }
    }

    private fun tokenFingerprint(token: String): String {
        if (token.isBlank()) return "-"
        if (token.length <= 12) return token
        return "${token.take(6)}...${token.takeLast(6)}"
    }

    private fun navigateToMain() {
        val mode = config.deviceMode
        val intent = if (mode.equals("FACEDESK_ENROLLMENT", ignoreCase = true)) {
            Intent(this, FaceDeskEnrollPickerActivity::class.java)
        } else {
            // Default: full-screen attendance (also the target for FACEDESK_ATTENDANCE).
            Intent(this, FaceDeskAttendanceActivity::class.java)
        }
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }

    private fun setLoading(loading: Boolean) {
        progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        btnRegister.isEnabled = !loading
        etToken.isEnabled = !loading
        etApiBase.isEnabled = !loading
    }
}
