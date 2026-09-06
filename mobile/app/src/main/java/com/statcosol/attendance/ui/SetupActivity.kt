package com.statcosol.attendance.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.statcosol.attendance.BuildConfig
import com.statcosol.attendance.AttendanceApp
import com.statcosol.attendance.R
import com.statcosol.attendance.facedesk.DeviceSession
import com.statcosol.attendance.facedesk.FaceDeskApiClient
import com.statcosol.attendance.facedesk.FaceDeskOfflineStore
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
    private val maintenanceHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private var maintenanceTick: Runnable? = null
    private lateinit var etToken: EditText
    private lateinit var etApiBase: EditText
    private lateinit var btnRegister: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var tvError: TextView
    private lateinit var offlineRosterCheckbox: CheckBox

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        config = DeviceConfig(this)

        // A registered device normally goes straight to the kiosk. Not while an
        // admin is deliberately out of it: with the kiosk as the HOME app this
        // screen is where the system lands after the PIN exit, and redirecting
        // here would put them right back where they just left — the maintenance
        // escape would be a loop. The window is short and self-clearing, so a
        // forgotten exit still returns the device to service on its own.
        if (config.isRegistered()) {
            if (!config.inMaintenanceWindow()) {
                navigateToMain()
                return
            }
            // Registered, but an admin is deliberately out of the kiosk.
            //
            // Standing down is right; showing TOKEN ENTRY while doing it is not.
            // A registered device asking a client's staff to "paste the install
            // token" reads as though the kiosk has lost its setup, and it invites
            // someone to type into a form that would re-provision the gate. This
            // was reported from the field within minutes of the exit hatch being
            // used for the first time.
            setContentView(R.layout.activity_setup)
            showMaintenanceMode()
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

    /**
     * The screen a registered device shows while an admin is out of the kiosk:
     * says what is happening, and offers the one action that makes sense — go
     * back. No token field, nothing that can re-provision the device.
     *
     * The window still expires on its own, so a forgotten exit returns the gate
     * to service without anyone touching it; this only removes the need to wait
     * when the admin has finished early.
     */
    private fun showMaintenanceMode() {
        findViewById<View>(R.id.tokenLayout).visibility = View.GONE
        findViewById<View>(R.id.apiInput).visibility = View.GONE
        findViewById<View>(R.id.adminPinInput).visibility = View.GONE
        findViewById<View>(R.id.offlineRosterCheckbox).visibility = View.GONE
        findViewById<View>(R.id.statusText).visibility = View.GONE
        findViewById<Button>(R.id.registerBtn).apply {
            setText(R.string.setup_maintenance_return)
            setOnClickListener { returnToKiosk() }
        }

        // The way back out of the device-owner restrictions.
        //
        // Nothing outside the app can lift them: dpm remove-active-admin refuses
        // to remove a Device Owner unless the package is testOnly, which a
        // production build is not. Without this the handset could never be reset
        // or repurposed. It sits here because this screen is only reachable with
        // the admin PIN, so the PIN gates it without a second prompt.
        //
        // Long-press, not tap: the button next to it is the one people mean, and
        // this should be hard to hit by accident.
        findViewById<TextView>(R.id.setupIntro).setOnLongClickListener {
            confirmReleaseForService()
            true
        }

        // Actually return when the window ends, rather than only promising to.
        //
        // The expiry was checked once, in onCreate. Left on this screen, nothing
        // brought the device back: the copy said the kiosk would return on its
        // own, an admin reasonably trusted it and walked away, and the gate
        // recorded nobody until someone pressed the button. That is precisely
        // the unattended gate the window exists to prevent, arrived at by
        // believing our own message.
        //
        // The countdown is shown rather than just scheduled, so the promise on
        // screen is one the admin can watch being kept.
        val intro = findViewById<TextView>(R.id.setupIntro)
        val tick = object : Runnable {
            override fun run() {
                val remainingMs = config.maintenanceUntilMs - System.currentTimeMillis()
                if (remainingMs <= 0L) {
                    returnToKiosk()
                    return
                }
                val seconds = (remainingMs / 1000L).toInt()
                intro.text = getString(
                    R.string.setup_maintenance_intro,
                    seconds / 60,
                    seconds % 60,
                )
                maintenanceHandler.postDelayed(this, 1000L)
            }
        }
        maintenanceTick = tick
        tick.run()
    }

    /**
     * Confirm before lifting the device-owner restrictions, because it cannot be
     * undone from here — re-applying them needs the kiosk set up again.
     */
    private fun confirmReleaseForService() {
        AlertDialog.Builder(this)
            .setTitle(R.string.setup_release_title)
            .setMessage(R.string.setup_release_message)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(R.string.setup_release_confirm) { _, _ ->
                KioskLock.releaseForService(this)
                Toast.makeText(this, R.string.setup_release_done, Toast.LENGTH_LONG).show()
            }
            .show()
    }

    /** End the maintenance window now and hand the device back to the kiosk. */
    private fun returnToKiosk() {
        cancelMaintenanceTick()
        // Clearing the window is what stops the kiosk bouncing straight back
        // here on the next HOME event.
        config.maintenanceUntilMs = 0L
        navigateToMain()
    }

    private fun cancelMaintenanceTick() {
        maintenanceTick?.let { maintenanceHandler.removeCallbacks(it) }
        maintenanceTick = null
    }

    override fun onDestroy() {
        cancelMaintenanceTick()
        super.onDestroy()
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
        val enteredPin = findViewById<EditText>(R.id.adminPinInput).text.toString().trim()
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
                config.faceDeskAdminPin = enteredPin
                res.identificationMode?.let { config.faceDeskIdentificationMode = it }
                // Start this registration with a clean offline queue — never carry
                // punches captured under a previous registration (possibly another
                // client) into the new one.
                runCatching { FaceDeskOfflineStore(this@SetupActivity).clear() }
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
        // Arm revocation detection for this (re-)registered session, so a later
        // portal removal resets the device again.
        DeviceSession.rearm()
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
