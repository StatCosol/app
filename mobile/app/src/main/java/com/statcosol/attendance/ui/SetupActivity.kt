package com.statcosol.attendance.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.statcosol.attendance.BuildConfig
import com.statcosol.attendance.AttendanceApp
import com.statcosol.attendance.R
import com.statcosol.attendance.facedesk.FaceDeskApiClient
import com.statcosol.attendance.facedesk.FaceDeskApiException
import com.statcosol.attendance.facedesk.FaceDeskAttendanceActivity
import com.statcosol.attendance.facedesk.FaceDeskEnrollPickerActivity
import com.statcosol.attendance.facedesk.FaceDeskRegisterRequest
import com.statcosol.attendance.kiosk.KioskActivity
import com.statcosol.attendance.prefs.DeviceConfig
import com.statcosol.attendance.roster.applyMobileAttendanceRegister
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

/**
 * Token entry / device bootstrap. Supports FaceDesk V2 (default) and the legacy
 * V1 offline-roster kiosk provisioned via mobile-attendance.
 */
class SetupActivity : AppCompatActivity() {

    private lateinit var config: DeviceConfig
    private lateinit var etToken: EditText
    private lateinit var etApiBase: EditText
    private lateinit var btnRegister: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var tvError: TextView
    private lateinit var offlineRosterCheckbox: CheckBox

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
        offlineRosterCheckbox = findViewById(R.id.offlineRosterCheckbox)

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

        // FaceDesk devices lock the kiosk behind an admin PIN (exit + enrollment),
        // so require a real one up front — never a blank or a trivial default.
        val faceDesk = !offlineRosterCheckbox.isChecked
        val adminPin = findViewById<EditText>(R.id.adminPinInput).text.toString().trim()
        if (faceDesk && !isValidAdminPin(adminPin)) {
            tvError.text = getString(R.string.setup_invalid_admin_pin)
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
        config.androidId = androidId

        if (offlineRosterCheckbox.isChecked) {
            registerV1Kiosk(token, androidId)
        } else {
            registerFaceDesk(token, androidId)
        }
    }

    /** A usable kiosk admin PIN: 4–12 digits and not all the same digit (so
     *  "0000"/"1111" and blanks are rejected). This PIN gates both the app-exit
     *  and enrollment mode, so it must not be trivially guessable. */
    private fun isValidAdminPin(pin: String): Boolean {
        if (pin.length < 4 || pin.length > 12) return false
        if (!pin.all { it.isDigit() }) return false
        return !pin.all { it == pin[0] }
    }

    private fun registerV1Kiosk(token: String, androidId: String) {
        val app = application as AttendanceApp
        lifecycleScope.launch {
            try {
                val res = withContext(Dispatchers.IO) {
                    app.mobileApi.register(token, androidId)
                }
                config.applyMobileAttendanceRegister(res)
                config.deviceMode = res.mode
                navigateToMain()
            } catch (e: Exception) {
                setLoading(false)
                tvError.text = e.message ?: getString(R.string.setup_registration_failed)
                tvError.visibility = View.VISIBLE
            }
        }
    }

    private fun registerFaceDesk(token: String, androidId: String) {
        lifecycleScope.launch {
            try {
                val fdClient = FaceDeskApiClient(config)
                val res = fdClient.register(
                    FaceDeskRegisterRequest(
                        installToken = token,
                        androidId = androidId,
                        appVersion = BuildConfig.VERSION_NAME,
                    ),
                )
                config.deviceToken = res.deviceToken
                config.deviceMode = "FACEDESK_${res.mode}"
                val enteredPin = findViewById<EditText>(R.id.adminPinInput).text.toString().trim()
                config.faceDeskAdminPin = enteredPin.ifBlank { res.adminPin }
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
        val intent = when {
            mode.equals("KIOSK", ignoreCase = true) ->
                Intent(this, KioskActivity::class.java)
            mode.equals("FACEDESK_ENROLLMENT", ignoreCase = true) ->
                Intent(this, FaceDeskEnrollPickerActivity::class.java)
            else ->
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
        offlineRosterCheckbox.isEnabled = !loading
    }
}
